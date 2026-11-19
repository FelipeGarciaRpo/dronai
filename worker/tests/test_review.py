"""Pruebas de la revisión de capturas: paralaje, medidas por cuadro, reglas del semáforo y videos sintéticos."""

import cv2
import numpy as np
import pytest

from dronai_worker.review import LOW_PARALLAX, frame_stats, judge, review_capture, rotation_residual

W, H = 960, 540


def _rotation(yaw_deg: float, pitch_deg: float = 0.0) -> np.ndarray:
    y, p = np.radians(yaw_deg), np.radians(pitch_deg)
    ry = np.array([[np.cos(y), 0, np.sin(y)], [0, 1, 0], [-np.sin(y), 0, np.cos(y)]])
    rx = np.array([[1, 0, 0], [0, np.cos(p), -np.sin(p)], [0, np.sin(p), np.cos(p)]])
    return rx @ ry


def _project(points: np.ndarray, rotation: np.ndarray, center: np.ndarray, focal: float) -> np.ndarray:
    """Proyecta puntos del mundo con una cámara (rotación mundo→cámara y centro en el mundo)."""
    cam = (points - center) @ rotation.T
    return cam[:, :2] / cam[:, 2:3] * focal + np.array([W / 2, H / 2])


def _scene(n: int = 400, seed: int = 0) -> np.ndarray:
    rng = np.random.default_rng(seed)
    return np.column_stack([rng.uniform(-20, 20, n), rng.uniform(-12, 12, n), rng.uniform(15, 60, n)])


def test_pure_rotation_has_no_parallax():
    pts, f = _scene(), 0.7 * W
    p0 = _project(pts, np.eye(3), np.zeros(3), f)
    p1 = _project(pts, _rotation(8, 3), np.zeros(3), f)
    p1 += np.random.default_rng(1).normal(0, 0.3, p1.shape)
    assert rotation_residual(p0, p1, W, H) < LOW_PARALLAX / 3


def test_moving_camera_has_parallax():
    pts, f = _scene(), 0.7 * W
    p0 = _project(pts, np.eye(3), np.zeros(3), f)
    p1 = _project(pts, _rotation(4), np.array([2.0, 0, 0]), f)
    assert rotation_residual(p0, p1, W, H) > 2 * LOW_PARALLAX


def test_flight_over_flat_ground_is_not_mistaken_for_a_spin():
    # El caso que engañó a la primera versión: un dron a 25 m, con la cámara inclinada 60° hacia abajo, que avanza
    # 3 m sobre un terreno plano (como la casa del DroneDeploy NeRF Dataset).
    # Coordenadas como las de la cámara (y hacia abajo): el suelo es el plano y = 25 y la cámara mira 60° hacia abajo.
    rng = np.random.default_rng(2)
    ground = np.column_stack([rng.uniform(-40, 40, 600), np.full(600, 25.0), rng.uniform(5, 80, 600)])
    tilt = _rotation(0, 60)
    f = 0.67 * W
    c0, c1 = np.zeros(3), np.array([3.0, 0, 0])
    p0, p1 = _project(ground, tilt, c0, f), _project(ground, tilt, c1, f)
    inside = (p0[:, 0] > 0) & (p0[:, 0] < W) & (p0[:, 1] > 0) & (p0[:, 1] < H) & (p1[:, 0] > 0) & (p1[:, 0] < W)
    assert inside.sum() > 100
    assert rotation_residual(p0[inside], p1[inside], W, H) > 1.5 * LOW_PARALLAX


def _texture(w: int, h: int, seed: int = 1, grain: int = 4) -> np.ndarray:
    noise = np.random.default_rng(seed).uniform(0, 255, (h // grain, w // grain)).astype(np.float32)
    return np.clip(cv2.resize(noise, (w, h), interpolation=cv2.INTER_CUBIC), 0, 255).astype(np.uint8)


def test_frame_flags():
    sharp = _texture(W, H)
    assert frame_stats(sharp, 0).flags() == []
    assert "borroso" in frame_stats(cv2.GaussianBlur(sharp, (0, 0), 6), 0).flags()
    assert "oscuro" in frame_stats((sharp * 0.12).astype(np.uint8), 0).flags()
    assert "liso" in frame_stats(np.full((H, W), 128, np.uint8), 0).flags()


GOOD = {"frames": 480, "blurry": 0.0, "dark": 0.0, "burnt": 0.0, "flat": 0.0, "usable": 1.0, "pairs": 15,
        "still": 0.0, "rotation": 0.05, "parallax": 2.0, "cuts": 0, "lost": 0, "noOverlap": 0.0, "longestSegment": 60.0}
VIDEO = {"kind": "video", "duration": 60.0, "count": 480}


@pytest.mark.parametrize(
    ("change", "expected"),
    [
        ({}, {}),
        ({"rotation": 0.9, "parallax": 0.1}, {"solo-gira": "rojo"}),
        ({"rotation": 0.5}, {"solo-gira": "amarillo"}),
        ({"dark": 0.7}, {"oscuro": "rojo"}),
        ({"blurry": 0.3}, {"borroso": "amarillo"}),
        ({"still": 0.9}, {"quieto": "rojo"}),
        ({"cuts": 3, "longestSegment": 25.0}, {"cortes": "amarillo"}),
        ({"cuts": 9, "longestSegment": 6.0}, {"cortes": "rojo"}),
        ({"cuts": 1, "longestSegment": 55.0}, {}),  # p. ej., un fundido a negro al final
        ({"lost": 6}, {"rapido": "amarillo"}),
        ({"lost": 30}, {"rapido": "rojo"}),
        ({"flat": 0.5}, {"liso": "amarillo"}),
    ],
)
def test_traffic_light_rules(change, expected):
    issues = judge(VIDEO, {**GOOD, **change})
    assert {i["code"]: i["level"] for i in issues} == expected


def test_short_video_is_red():
    issues = judge({**VIDEO, "duration": 4.0}, GOOD)
    assert {i["code"]: i["level"] for i in issues} == {"corta": "rojo"}


def _write_video(path, frames, fps=24):
    writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"MJPG"), fps, (W, H))
    for frame in frames:
        writer.write(cv2.cvtColor(frame, cv2.COLOR_GRAY2BGR))
    writer.release()


def test_review_spots_a_spinning_camera(tmp_path):
    # Una cámara que gira sin moverse, generada exactamente: cada cuadro es la misma imagen vista con otro giro.
    src = _texture(1600, 1200, seed=3)
    k_src = np.array([[1100.0, 0, 800], [0, 1100.0, 600], [0, 0, 1]])
    k_out = np.array([[1.2 * W, 0, W / 2], [0, 1.2 * W, H / 2], [0, 0, 1]])
    frames = []
    for s in np.linspace(0, 1, 24 * 12):
        rot = _rotation(10 * np.sin(2 * np.pi * s), 4 * np.sin(4 * np.pi * s))
        warp = k_src @ rot @ np.linalg.inv(k_out)  # de píxel de salida a píxel de la imagen fuente
        frames.append(cv2.warpPerspective(src, warp, (W, H), flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP))
    _write_video(tmp_path / "giro.avi", frames)
    report = review_capture(tmp_path / "giro.avi")
    assert report["verdict"] == "rojo"
    assert {i["code"] for i in report["issues"]} == {"solo-gira"}


def test_review_accepts_a_moving_camera(tmp_path):
    # Dos capas a distinta distancia que se deslizan a distinta velocidad: paralaje que ningún giro explica.
    far, near = _texture(3200, H, seed=4), _texture(4800, H, seed=5)
    frames = []
    for k in range(24 * 12):
        frame = far[:, 2 * k : 2 * k + W].copy()
        frame[300:] = near[300:, 6 * k : 6 * k + W]
        frames.append(frame)
    _write_video(tmp_path / "avance.avi", frames)
    report = review_capture(tmp_path / "avance.avi")
    assert report["verdict"] == "verde", report["issues"]
