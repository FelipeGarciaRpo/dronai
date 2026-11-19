"""Lectura y escritura de modelos COLMAP en formato binario (cameras.bin, images.bin y points3D.bin).

Es el formato que leen los entrenadores de Gaussian splats (Brush, gsplat, nerfstudio) cuando las poses
de las fotos ya se conocen.
"""

import struct
from pathlib import Path

import numpy as np

from .scene import Calibration, CameraPose

SIMPLE_PINHOLE = 0  # parámetros f, cx, cy
PINHOLE = 1  # identificador del modelo de cámara PINHOLE en COLMAP (parámetros fx, fy, cx, cy)
# Cantidad de parámetros de cada modelo de cámara de COLMAP, para poder saltarlos al leer.
PARAMS = {0: 3, 1: 4, 2: 4, 3: 5, 4: 8, 5: 8, 6: 12, 7: 5, 8: 4, 9: 5, 10: 12}


def quaternion_to_rotation(q: np.ndarray) -> np.ndarray:
    """Cuaternión (w, x, y, z) → matriz de rotación."""
    w, x, y, z = np.asarray(q, dtype=np.float64) / np.linalg.norm(q)
    return np.array([
        [1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)],
        [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)],
        [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)],
    ])


def read_model(path: Path) -> tuple[Calibration, list[CameraPose], np.ndarray, np.ndarray]:
    """Lee un modelo con una sola cámara sin distorsión (PINHOLE), como el que deja `colmap image_undistorter`."""
    with open(path / "cameras.bin", "rb") as f:
        (count,) = struct.unpack("<Q", f.read(8))
        cameras = {}
        for _ in range(count):
            camera_id, model, width, height = struct.unpack("<iiQQ", f.read(24))
            params = struct.unpack(f"<{PARAMS[model]}d", f.read(8 * PARAMS[model]))
            cameras[camera_id] = (model, width, height, params)
    if len(cameras) != 1:
        raise ValueError(f"Se esperaba una sola cámara compartida y el modelo tiene {len(cameras)}")
    model, width, height, params = next(iter(cameras.values()))
    if model == PINHOLE:
        fx, fy, cx, cy = params
    elif model == SIMPLE_PINHOLE:
        fx, cx, cy = params
        fy = fx
    else:
        raise ValueError("La cámara tiene distorsión: corre antes `colmap image_undistorter`")
    calib = Calibration(int(width), int(height), fx, fy, cx, cy, 0.0, 0.0, 0.0, 0.0, 0.0)

    poses = []
    with open(path / "images.bin", "rb") as f:
        (count,) = struct.unpack("<Q", f.read(8))
        for _ in range(count):
            _image_id, *qt, _camera_id = struct.unpack("<i4d3di", f.read(64))
            name = b""
            while (char := f.read(1)) != b"\0":
                name += char
            (num_points2d,) = struct.unpack("<Q", f.read(8))
            f.seek(24 * num_points2d, 1)  # x, y, id del punto 3D de cada observación
            poses.append(CameraPose(name.decode("utf-8"), quaternion_to_rotation(qt[:4]), np.array(qt[4:])))

    xyz, rgb = [], []
    with open(path / "points3D.bin", "rb") as f:
        (count,) = struct.unpack("<Q", f.read(8))
        for _ in range(count):
            _point_id, x, y, z, r, g, b, _error, track = struct.unpack("<Q3d3BdQ", f.read(51))
            f.seek(8 * track, 1)  # (imagen, índice de la observación) de cada foto que lo ve
            xyz.append((x, y, z))
            rgb.append((r, g, b))
    return calib, poses, np.array(xyz, dtype=np.float64).reshape(-1, 3), np.array(rgb, dtype=np.uint8).reshape(-1, 3)


def rotation_to_quaternion(r: np.ndarray) -> np.ndarray:
    """Matriz de rotación → cuaternión (w, x, y, z) con w >= 0."""
    trace = r[0, 0] + r[1, 1] + r[2, 2]
    if trace > 0:
        s = 2 * np.sqrt(trace + 1)
        q = [0.25 * s, (r[2, 1] - r[1, 2]) / s, (r[0, 2] - r[2, 0]) / s, (r[1, 0] - r[0, 1]) / s]
    elif r[0, 0] > r[1, 1] and r[0, 0] > r[2, 2]:
        s = 2 * np.sqrt(1 + r[0, 0] - r[1, 1] - r[2, 2])
        q = [(r[2, 1] - r[1, 2]) / s, 0.25 * s, (r[0, 1] + r[1, 0]) / s, (r[0, 2] + r[2, 0]) / s]
    elif r[1, 1] > r[2, 2]:
        s = 2 * np.sqrt(1 + r[1, 1] - r[0, 0] - r[2, 2])
        q = [(r[0, 2] - r[2, 0]) / s, (r[0, 1] + r[1, 0]) / s, 0.25 * s, (r[1, 2] + r[2, 1]) / s]
    else:
        s = 2 * np.sqrt(1 + r[2, 2] - r[0, 0] - r[1, 1])
        q = [(r[1, 0] - r[0, 1]) / s, (r[0, 2] + r[2, 0]) / s, (r[1, 2] + r[2, 1]) / s, 0.25 * s]
    q = np.array(q) / np.linalg.norm(q)
    return q if q[0] >= 0 else -q


def write_model(out: Path, camera: Calibration, poses: list[CameraPose], xyz: np.ndarray, rgb: np.ndarray) -> None:
    """Escribe un modelo con una sola cámara PINHOLE compartida por todas las fotos.

    Los puntos se guardan sin "tracks" (no se sabe en qué fotos aparece cada uno): solo sirven para
    inicializar los splats.
    """
    out.mkdir(parents=True, exist_ok=True)

    with open(out / "cameras.bin", "wb") as f:
        f.write(struct.pack("<Q", 1))
        f.write(struct.pack("<iiQQ", 1, PINHOLE, camera.width, camera.height))
        f.write(struct.pack("<4d", camera.fx, camera.fy, camera.cx, camera.cy))

    with open(out / "images.bin", "wb") as f:
        f.write(struct.pack("<Q", len(poses)))
        for image_id, pose in enumerate(poses, start=1):
            f.write(struct.pack("<i4d3di", image_id, *rotation_to_quaternion(pose.rotation), *pose.translation, 1))
            f.write(pose.image.encode("utf-8") + b"\0")
            f.write(struct.pack("<Q", 0))  # sin observaciones 2D

    points = np.zeros(
        len(xyz), dtype=[("id", "<u8"), ("xyz", "<f8", 3), ("rgb", "u1", 3), ("error", "<f8"), ("track", "<u8")]
    )
    points["id"] = np.arange(1, len(xyz) + 1)
    points["xyz"] = xyz
    points["rgb"] = rgb
    with open(out / "points3D.bin", "wb") as f:
        f.write(struct.pack("<Q", len(points)))
        points.tofile(f)
