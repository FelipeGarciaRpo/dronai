"""Qué foto "pinta" cada punto: la que lo ve más de cerca sin que nada lo tape.

El visor usa este dato para reconstruir la escena foto a foto, siguiendo el recorrido del dron: los
puntos de cada foto salen de la cámara y caen en su lugar. (Con "la primera foto que lo ve", unas pocas
fotos tomadas desde lejos se quedarían con casi toda la nube.)
"""

import numpy as np

from .scene import Calibration, CameraPose

NEVER = np.iinfo(np.uint16).max


def best_views(xyz: np.ndarray, cameras: list[CameraPose], calib: Calibration,
               scale: float = 1 / 8, tolerance: float = 0.02) -> np.ndarray:
    """Índice (en el orden de `cameras`) de la foto más cercana que ve cada punto, o NEVER si ninguna lo ve.

    Los puntos tapados se descartan con un z-buffer a `scale` de la resolución de las fotos: en cada
    píxel solo cuentan los puntos que están a menos de `tolerance` (relativo) del más cercano.
    """
    w, h = round(calib.width * scale), round(calib.height * scale)
    fx, fy, cx, cy = calib.fx * scale, calib.fy * scale, calib.cx * scale, calib.cy * scale
    points = xyz.astype(np.float64)
    best = np.full(len(points), NEVER, dtype=np.uint16)
    best_dist = np.full(len(points), np.inf)
    zmin = np.empty(w * h)

    for k, cam in enumerate(cameras):
        pc = points @ cam.rotation.T + cam.translation
        idx = np.flatnonzero(pc[:, 2] > 0.1)
        z = pc[idx, 2]
        u = np.floor(fx * pc[idx, 0] / z + cx).astype(np.int64)
        v = np.floor(fy * pc[idx, 1] / z + cy).astype(np.int64)
        inside = (u >= 0) & (u < w) & (v >= 0) & (v < h)
        idx, z, pix = idx[inside], z[inside], v[inside] * w + u[inside]

        zmin.fill(np.inf)
        np.minimum.at(zmin, pix, z)
        visible = z <= zmin[pix] * (1 + tolerance)
        seen = idx[visible]
        dist = np.linalg.norm(pc[seen], axis=1)
        closer = dist < best_dist[seen]
        best[seen[closer]] = k
        best_dist[seen[closer]] = dist[closer]
    return best
