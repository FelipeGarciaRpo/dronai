"""Importa escenas del DroneDeploy NeRF Dataset (DNF) al formato del visor web y al de entrenamiento.

Cada escena trae las fotos del dron, sus poses en cameras.xml (formato Agisoft, en metros y en
coordenadas este-norte-arriba) y una nube densa de puntos calculada por DroneDeploy.
"""

import time
import xml.etree.ElementTree as ET
from datetime import datetime
from pathlib import Path

import numpy as np
from PIL import Image

from .colmap_model import write_model
from .images import undistort_images
from .ply import read_points
from .scene import Calibration, CameraPose, convergence
from .web_scene import write_web_scene

SOURCE = {
    "name": "DroneDeploy NeRF Dataset",
    "url": "https://github.com/nickponline/dd-nerf-dataset",
    "license": "CC BY-NC-SA 4.0",
}

EXIF_IFD = 0x8769
DATETIME_ORIGINAL = 36867


def read_cameras(xml_path: Path) -> tuple[str, Calibration, list[CameraPose]]:
    """Lee el sensor, su calibración y la pose de cada cámara habilitada."""
    root = ET.parse(xml_path).getroot()
    sensor = root.find("./chunk/sensors/sensor")
    calib = sensor.find("calibration")
    res = calib.find("resolution")
    width, height = int(res.get("width")), int(res.get("height"))

    def value(tag: str) -> float:
        return float(calib.findtext(tag) or 0.0)

    fx = value("fx") or value("f")
    cx, cy = value("cx"), value("cy")
    # Las versiones nuevas de Agisoft guardan cx y cy como desplazamiento desde el centro de la imagen;
    # las viejas, como coordenadas absolutas.
    if abs(cx) < width / 4 and abs(cy) < height / 4:
        cx, cy = width / 2 + cx, height / 2 + cy
    # Aunque el archivo usa el formato de Agisoft, sus p1 y p2 siguen la convención de OpenCV: al
    # proyectar la nube densa sobre 18 fotos, así quedan a 0.5 px de la imagen (con la de Agisoft, a 2 px).
    calibration = Calibration(width, height, fx, value("fy") or fx, cx, cy,
                              value("k1"), value("k2"), value("k3"), value("p1"), value("p2"))

    labels, matrices = [], []
    for cam in root.iterfind("./chunk/cameras/camera"):
        text = cam.findtext("transform")
        if cam.get("enabled", "true") in ("false", "0") or not text:
            continue
        labels.append(Path(cam.get("label")).name)
        matrices.append(np.array(text.split(), dtype=np.float64).reshape(4, 4))

    rot = np.stack([m[:3, :3] for m in matrices])
    trans = np.stack([m[:3, 3] for m in matrices])
    # El XML no aclara si la matriz va del mundo a la cámara o al revés: se prueban las dos lecturas
    # y se queda la que hace que todas las cámaras miren hacia un mismo punto.
    rot_t = rot.transpose(0, 2, 1)
    candidates = [(rot, trans), (rot_t, -np.einsum("nij,nj->ni", rot_t, trans))]

    def score(candidate: tuple[np.ndarray, np.ndarray]) -> float:
        r, t = candidate
        return convergence(-np.einsum("nji,nj->ni", r, t), r[:, 2, :])

    rotations, translations = max(candidates, key=score)
    # Quitar el ruido numérico: la rotación más cercana (en el sentido de Frobenius) a cada matriz.
    u, _, vt = np.linalg.svd(rotations)
    rotations = u @ vt
    if np.any(np.linalg.det(rotations) < 0):
        raise ValueError("cameras.xml tiene matrices que no son rotaciones")

    cameras = [CameraPose(label, r, t) for label, r, t in zip(labels, rotations, translations)]
    return sensor.get("label"), calibration, cameras


def capture_time(image_path: Path) -> datetime | None:
    try:
        with Image.open(image_path) as img:
            value = img.getexif().get_ifd(EXIF_IFD).get(DATETIME_ORIGINAL)
        return datetime.strptime(value, "%Y:%m:%d %H:%M:%S") if value else None
    except (OSError, ValueError):
        return None


def _sample(xyz: np.ndarray, rgb: np.ndarray, max_points: int) -> tuple[np.ndarray, np.ndarray]:
    if len(xyz) <= max_points:
        return xyz, rgb
    keep = np.sort(np.random.default_rng(0).choice(len(xyz), size=max_points, replace=False))
    return xyz[keep], rgb[keep]


def import_scene(dataset: Path, out: Path, scene_id: str, title: str, max_points: int) -> dict:
    sensor, calib, cameras = read_cameras(dataset / "cameras.xml")

    # Ordenar por hora de captura para que la línea siga el recorrido real del dron.
    times = {cam.image: capture_time(dataset / "images" / cam.image) for cam in cameras}
    ordered = all(times.values())
    if ordered:
        cameras.sort(key=lambda cam: times[cam.image])

    xyz, rgb = read_points(dataset / "points" / "points.ply")
    total_points = len(xyz)
    xyz, rgb = _sample(xyz, rgb, max_points)
    shot_times = sorted(times.values()) if ordered else []
    photos = {
        "count": len(cameras),
        "width": calib.width,
        "height": calib.height,
        "start": shot_times[0].isoformat() if shot_times else None,
        "minutes": round((shot_times[-1] - shot_times[0]).total_seconds() / 60, 1) if shot_times else None,
    }
    return write_web_scene(
        out, scene_id=scene_id, title=title, source=SOURCE,
        method="Nube densa calculada por DroneDeploy, incluida en el dataset", sensor=sensor, calib=calib,
        cameras=cameras, image_paths=[dataset / "images" / cam.image for cam in cameras], xyz=xyz, rgb=rgb,
        photos=photos, ordered=ordered, metric=True, total_points=total_points,
    )


def export_training_data(dataset: Path, out: Path, max_size: int, init_points: int) -> Calibration:
    """Prepara la escena para entrenar Gaussian splats con las poses de DroneDeploy.

    Escribe out/images (fotos sin distorsión y reducidas) y out/sparse/0 (modelo COLMAP binario con una
    cámara PINHOLE, la pose de cada foto y una muestra de la nube densa para inicializar los splats).
    Las coordenadas quedan en metros este-norte-arriba, las mismas de la nube de DroneDeploy.
    """
    start = time.perf_counter()
    sensor, calib, cameras = read_cameras(dataset / "cameras.xml")
    pinhole = undistort_images([dataset / "images" / cam.image for cam in cameras], out / "images", calib, max_size)
    elapsed_images = time.perf_counter() - start

    xyz, rgb = read_points(dataset / "points" / "points.ply")
    xyz, rgb = _sample(xyz, rgb, init_points)
    write_model(out / "sparse" / "0", pinhole, cameras, xyz.astype(np.float64), rgb)

    print(f"Sensor: {sensor} · {calib.width}x{calib.height} · f = {calib.fx:.1f} px")
    print(f"Fotos: {len(cameras)} corregidas y reducidas a {pinhole.width}x{pinhole.height} en {elapsed_images:.0f} s")
    print(f"Cámara PINHOLE: fx = {pinhole.fx:.2f}, fy = {pinhole.fy:.2f}, cx = {pinhole.cx:.2f}, cy = {pinhole.cy:.2f}")
    print(f"Puntos para inicializar: {len(xyz):,}")
    print(f"Datos de entrenamiento escritos en {out}")
    return pinhole
