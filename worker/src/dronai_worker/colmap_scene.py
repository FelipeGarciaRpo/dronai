"""Escena a partir de un modelo COLMAP calculado por DronAI (por ejemplo, con los cuadros clave de un video).

COLMAP entrega las poses en un sistema de coordenadas arbitrario: no sabe dónde está "arriba" ni cuánto mide nada.
Antes de usarlas se alinean: se estima la vertical, se centra la escena y se lleva a una escala de trabajo. Del
modelo alineado salen los datos para entrenar los splats (images/ + sparse/0) y la escena del visor web.
"""

import json
import os
import shutil
from pathlib import Path

import numpy as np

from .colmap_model import read_model, write_model
from .scene import CameraPose, convergence, look_at_point
from .web_scene import write_web_scene

WORK_RADIUS = 20.0  # distancia mediana de las cámaras al centro, en unidades de la escena alineada


def upright_frame(poses: list[CameraPose]) -> np.ndarray:
    """Rotación que lleva la vertical estimada al eje z (filas: los ejes nuevos en las coordenadas de COLMAP).

    Un dron o un celular casi nunca graban con la cámara inclinada de lado, así que el eje "derecha" de cada
    imagen queda horizontal. La vertical es entonces la dirección más perpendicular a todos esos ejes. Si todas las
    cámaras miran hacia el mismo lado (los ejes derecha son casi paralelos) esa dirección no está definida, y se usa
    el promedio de los "arriba" de las imágenes.
    """
    rights = np.stack([p.rotation[0] for p in poses])
    image_ups = -np.stack([p.down for p in poses])
    values, vectors = np.linalg.eigh(rights.T @ rights)
    up = vectors[:, 0] if values[1] > 0.05 * values[2] else image_ups.mean(axis=0)
    up /= np.linalg.norm(up)
    if up @ image_ups.mean(axis=0) < 0:
        up = -up
    # El eje y nuevo apunta hacia donde miran las cámaras en promedio, proyectado sobre el plano horizontal.
    forward = np.stack([p.forward for p in poses]).mean(axis=0)
    y = forward - (forward @ up) * up
    if np.linalg.norm(y) < 1e-6:
        y = np.cross(up, [1.0, 0, 0]) if abs(up[0]) < 0.9 else np.cross(up, [0, 1.0, 0])
    y /= np.linalg.norm(y)
    return np.stack([np.cross(y, up), y, up])


def align(poses: list[CameraPose], xyz: np.ndarray) -> tuple[list[CameraPose], np.ndarray, dict]:
    """Similitud X' = s·Q·(X − c): vertical en z, centro de atención en el origen y escala de trabajo."""
    q = upright_frame(poses)
    centers = np.stack([p.center for p in poses])
    forwards = np.stack([p.forward for p in poses])
    # En una órbita las cámaras miran a un centro común; en un recorrido hacia adelante ese punto no está bien
    # definido y se usa el centro de la nube.
    c = look_at_point(centers, forwards) if convergence(centers, forwards) >= 0.6 else np.median(xyz, axis=0)
    s = WORK_RADIUS / float(np.median(np.linalg.norm(centers - c, axis=1)))
    aligned = [CameraPose(p.image, p.rotation @ q.T, s * (p.rotation @ c + p.translation)) for p in poses]
    return aligned, s * (xyz - c) @ q.T, {"scale": s, "rotation": q.tolist(), "center": c.tolist()}


def _link_or_copy(src: Path, dst: Path) -> None:
    try:
        os.link(src, dst)
    except OSError:
        shutil.copy2(src, dst)


def import_colmap(
    workdir: Path,
    web_out: Path,
    *,
    scene_id: str,
    title: str,
    source: dict,
    sensor: str,
) -> dict:
    """Lee workdir/undistorted (salida de `colmap image_undistorter`) y escribe workdir/aligned y la escena web."""
    model_dir = workdir / "undistorted" / "sparse"
    images_dir = workdir / "undistorted" / "images"
    calib, poses, xyz, rgb = read_model(model_dir)
    poses.sort(key=lambda p: p.image)  # los cuadros clave están numerados en el orden del video
    aligned, xyz_aligned, transform = align(poses, xyz)

    train = workdir / "aligned"
    shutil.rmtree(train, ignore_errors=True)
    (train / "images").mkdir(parents=True)
    for pose in aligned:
        _link_or_copy(images_dir / pose.image, train / "images" / pose.image)
    write_model(train / "sparse" / "0", calib, aligned, xyz_aligned, rgb)
    (train / "alineacion.json").write_text(json.dumps(transform, indent=1), encoding="utf-8")
    print(f"Datos de entrenamiento alineados en {train} ({len(aligned)} cámaras, {len(xyz):,} puntos)")

    keyframes = json.loads((workdir / "keyframes.json").read_text(encoding="utf-8"))
    times = {k["file"]: k["t"] for k in keyframes["frames"]}
    registered = [times[p.image] for p in aligned if p.image in times]
    segment = keyframes["segment"]
    photos = {
        "count": len(aligned),
        "width": calib.width,
        "height": calib.height,
        "start": None,
        "minutes": round((segment["end"] - segment["start"]) / 60, 2),
    }
    extra = {
        "video": {
            "name": keyframes["video"],
            "keyframes": len(keyframes["frames"]),
            "registered": len(aligned),
            "segment": segment,
            "times": registered,
        }
    }
    return write_web_scene(
        web_out, scene_id=scene_id, title=title, source=source,
        method="Poses y nube de puntos calculadas por DronAI con COLMAP, a partir del video", sensor=sensor,
        calib=calib, cameras=aligned, image_paths=[images_dir / p.image for p in aligned], xyz=xyz_aligned,
        rgb=rgb, photos=photos, ordered=True, metric=False, extra=extra,
    )
