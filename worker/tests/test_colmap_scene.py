"""Pruebas de la lectura de modelos COLMAP, la alineación de la vertical y la extracción de cuadros clave."""

import json

import cv2
import numpy as np

from dronai_worker.colmap_model import read_model, write_model
from dronai_worker.colmap_scene import WORK_RADIUS, align, upright_frame
from dronai_worker.keyframes import extract_keyframes
from dronai_worker.scene import Calibration, CameraPose


def _random_rotation(seed: int) -> np.ndarray:
    q, r = np.linalg.qr(np.random.default_rng(seed).normal(size=(3, 3)))
    q *= np.sign(np.diag(r))
    return q if np.linalg.det(q) > 0 else -q


def _orbit(n: int = 24, radius: float = 30.0, height: float = 15.0) -> list[CameraPose]:
    """Cámaras en círculo, a una altura, mirando al origen (mundo con z hacia arriba)."""
    poses = []
    for a in np.linspace(0, 2 * np.pi, n, endpoint=False):
        center = np.array([radius * np.cos(a), radius * np.sin(a), height])
        forward = -center / np.linalg.norm(center)
        right = np.cross(forward, [0, 0, 1.0])
        right /= np.linalg.norm(right)
        down = np.cross(forward, right)
        rotation = np.stack([right, down, forward])  # filas: ejes de la cámara en el mundo
        poses.append(CameraPose(f"{len(poses):05d}.jpg", rotation, -rotation @ center))
    return poses


def test_model_roundtrip(tmp_path):
    calib = Calibration(1600, 900, 1200.0, 1201.0, 800.0, 450.0, 0, 0, 0, 0, 0)
    poses = _orbit()
    xyz = np.random.default_rng(0).normal(size=(50, 3))
    rgb = np.random.default_rng(1).integers(0, 255, (50, 3)).astype(np.uint8)
    write_model(tmp_path, calib, poses, xyz, rgb)
    calib2, poses2, xyz2, rgb2 = read_model(tmp_path)
    assert (calib2.width, calib2.height, calib2.fx, calib2.cy) == (1600, 900, 1200.0, 450.0)
    assert [p.image for p in poses2] == [p.image for p in poses]
    for a, b in zip(poses, poses2):
        assert np.allclose(a.rotation, b.rotation, atol=1e-9) and np.allclose(a.translation, b.translation)
    assert np.allclose(xyz, xyz2) and (rgb == rgb2).all()


def test_alignment_recovers_the_vertical():
    # Se gira y se escala el mundo a propósito, como si viniera de COLMAP, y la alineación debe devolver
    # la vertical al eje z y llevar la escena a la escala de trabajo.
    poses = _orbit()
    g, s = _random_rotation(3), 0.37
    xyz = np.random.default_rng(4).normal(size=(200, 3)) * 5
    scrambled = [CameraPose(p.image, p.rotation @ g.T, s * p.translation) for p in poses]
    aligned, xyz_aligned, _ = align(scrambled, s * xyz @ g.T)
    ups = -np.stack([p.down for p in aligned])
    tilt = np.degrees(np.arccos(np.clip(ups @ [0, 0, 1.0], -1, 1)))
    assert np.allclose(tilt, tilt[0], atol=1e-6)  # todas igual de inclinadas respecto de la nueva vertical
    centers = np.stack([p.center for p in aligned])
    assert abs(np.median(np.linalg.norm(centers, axis=1)) - WORK_RADIUS) < 1e-6
    assert (centers[:, 2] > 0).all()  # el dron queda arriba, no abajo
    assert np.allclose(upright_frame(aligned)[2], [0, 0, 1.0], atol=1e-6)
    assert xyz_aligned.shape == xyz.shape


def _texture(w: int, h: int, seed: int) -> np.ndarray:
    # Detalle fino (para seguir puntos) sobre formas grandes (lo que distingue una escena de otra, como en un corte).
    rng = np.random.default_rng(seed)
    fine = cv2.resize(rng.uniform(-60, 60, (h // 4, w // 4)).astype(np.float32), (w, h), interpolation=cv2.INTER_CUBIC)
    shapes = cv2.resize(rng.uniform(30, 225, (max(1, h // 90), max(1, w // 90))).astype(np.float32), (w, h),
                        interpolation=cv2.INTER_CUBIC)
    return np.clip(shapes + fine, 0, 255).astype(np.uint8)


def test_keyframes_keep_the_longest_take(tmp_path):
    # Dos tomas de escenas distintas: 4 s y después 8 s. Los cuadros clave deben salir solo de la segunda.
    w, h, fps = 640, 360, 24
    writer = cv2.VideoWriter(str(tmp_path / "video.avi"), cv2.VideoWriter_fourcc(*"MJPG"), fps, (w, h))
    for seconds, seed in ((4, 10), (8, 11)):
        far, near = _texture(4000, h, seed), _texture(6000, h, seed + 100)
        for k in range(seconds * fps):
            frame = far[:, k : k + w].copy()
            frame[200:] = near[200:, 2 * k : 2 * k + w]
            writer.write(cv2.cvtColor(frame, cv2.COLOR_GRAY2BGR))
    writer.release()

    info = extract_keyframes(tmp_path / "video.avi", tmp_path / "work", max_size=640)
    assert info["segment"]["count"] == 2
    assert info["segment"]["start"] >= 3.9
    times = [f["t"] for f in info["frames"]]
    assert len(times) >= 8 and times == sorted(times)
    assert len(list((tmp_path / "work" / "images").glob("*.jpg"))) == len(times)
    assert json.loads((tmp_path / "work" / "keyframes.json").read_text(encoding="utf-8"))["frames"] == info["frames"]
