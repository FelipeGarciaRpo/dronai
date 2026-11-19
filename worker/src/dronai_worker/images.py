"""Preparación de fotos para entrenar: corregir la distorsión del lente y reducir el tamaño."""

import os
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import cv2
import numpy as np

from .scene import Calibration

_REDUCED_READ = {1: cv2.IMREAD_COLOR, 2: cv2.IMREAD_REDUCED_COLOR_2, 4: cv2.IMREAD_REDUCED_COLOR_4, 8: cv2.IMREAD_REDUCED_COLOR_8}


def _read(path: Path, factor: int) -> np.ndarray:
    # imdecode en vez de imread para que funcione con cualquier ruta en Windows. Se ignora la orientación
    # EXIF porque la calibración describe el sensor tal como guarda la imagen.
    flags = _REDUCED_READ[factor] | cv2.IMREAD_IGNORE_ORIENTATION
    img = cv2.imdecode(np.fromfile(path, dtype=np.uint8), flags)
    if img is None:
        raise ValueError(f"No se pudo leer {path}")
    return img


def _scaled(calib: Calibration, width: int, height: int) -> Calibration:
    sx, sy = width / calib.width, height / calib.height
    return Calibration(width, height, calib.fx * sx, calib.fy * sy, calib.cx * sx, calib.cy * sy,
                       calib.k1, calib.k2, calib.k3, calib.p1, calib.p2)


def _source_coords(calib: Calibration, u: np.ndarray, v: np.ndarray, zoom: float) -> tuple[np.ndarray, np.ndarray]:
    """Para píxeles (u, v) de la imagen corregida, su posición en la foto original."""
    xd, yd = calib.distort((u - calib.cx) / (calib.fx * zoom), (v - calib.cy) / (calib.fy * zoom))
    return xd * calib.fx + calib.cx, yd * calib.fy + calib.cy


def _min_zoom(calib: Calibration) -> float:
    """Menor zoom que deja todos los píxeles de la imagen corregida dentro de la foto (sin bordes negros)."""
    w, h = calib.width, calib.height
    cols, rows = np.arange(w) + 0.5, np.arange(h) + 0.5
    u = np.concatenate([cols, cols, np.full(h, 0.5), np.full(h, w - 0.5)])
    v = np.concatenate([np.full(w, 0.5), np.full(w, h - 0.5), rows, rows])

    def inside(zoom: float) -> bool:
        us, vs = _source_coords(calib, u, v, zoom)
        return bool(us.min() >= 0.5 and vs.min() >= 0.5 and us.max() <= w - 0.5 and vs.max() <= h - 0.5)

    if inside(1.0):
        return 1.0
    hi = 1.0
    while not inside(hi):
        hi *= 1.01
        if hi > 1.5:
            raise ValueError("La distorsión es demasiado fuerte para corregirla sin bordes negros")
    lo = hi / 1.01
    for _ in range(40):
        mid = (lo + hi) / 2
        lo, hi = (lo, mid) if inside(mid) else (mid, hi)
    return hi


def write_thumbnails(paths: list[Path], out_dir: Path, source_width: int, width: int = 320) -> list[str]:
    """Guarda una miniatura JPEG de cada foto como out_dir/000.jpg, 001.jpg, … (en el orden recibido)."""
    out_dir.mkdir(parents=True, exist_ok=True)
    names = [f"{i:03d}.jpg" for i in range(len(paths))]
    factor = max(f for f in _REDUCED_READ if source_width / f >= width)

    def process(item: tuple[Path, str]) -> None:
        path, name = item
        img = _read(path, factor)
        height = round(img.shape[0] * width / img.shape[1])
        img = cv2.resize(img, (width, height), interpolation=cv2.INTER_AREA)
        ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 82])
        if not ok:
            raise ValueError(f"No se pudo guardar la miniatura de {path.name}")
        buf.tofile(out_dir / name)

    with ThreadPoolExecutor(max_workers=min(8, os.cpu_count() or 4)) as pool:
        list(pool.map(process, zip(paths, names)))
    return names


def undistort_images(paths: list[Path], out_dir: Path, calib: Calibration, max_size: int) -> Calibration:
    """Corrige la distorsión de cada foto, la reduce a max_size px de lado mayor y la guarda como JPEG.

    Devuelve la calibración PINHOLE (sin distorsión) de las fotos nuevas.
    """
    out_dir.mkdir(parents=True, exist_ok=True)
    # Decodificar el JPEG a 1/2, 1/4 u 1/8 de resolución es mucho más rápido; se usa el mayor factor
    # que todavía deja la imagen más grande que el tamaño final.
    factor = max(f for f in _REDUCED_READ if max(calib.width, calib.height) / f >= max_size)
    height, width = _read(paths[0], factor).shape[:2]
    source = _scaled(calib, width, height)

    zoom = _min_zoom(source)
    u, v = np.meshgrid(np.arange(width) + 0.5, np.arange(height) + 0.5)
    us, vs = _source_coords(source, u, v, zoom)
    # cv2.remap usa la convención de OpenCV: el centro del primer píxel está en (0, 0).
    map_x, map_y = (us - 0.5).astype(np.float32), (vs - 0.5).astype(np.float32)

    scale = max_size / max(width, height)
    out_w, out_h = round(width * scale), round(height * scale)

    def process(path: Path) -> None:
        img = _read(path, factor)
        if img.shape[:2] != (height, width):
            raise ValueError(f"{path.name} mide {img.shape[1]}x{img.shape[0]}, se esperaba {width}x{height}")
        img = cv2.remap(img, map_x, map_y, cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
        img = cv2.resize(img, (out_w, out_h), interpolation=cv2.INTER_AREA)
        ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 95])
        if not ok:
            raise ValueError(f"No se pudo guardar {path.name}")
        buf.tofile(out_dir / path.name)

    with ThreadPoolExecutor(max_workers=min(8, os.cpu_count() or 4)) as pool:
        list(pool.map(process, paths))

    sx, sy = out_w / width, out_h / height
    return Calibration(out_w, out_h, source.fx * zoom * sx, source.fy * zoom * sy, source.cx * sx, source.cy * sy)
