"""Geometría común: poses y calibración de cámaras, y ejes del visor web (Y hacia arriba, metros)."""

from dataclasses import dataclass

import numpy as np

# (este, norte, arriba) → ejes del visor three.js: x = este, y = arriba, z = sur
ENU_TO_VIEWER = np.array([[1.0, 0.0, 0.0], [0.0, 0.0, 1.0], [0.0, -1.0, 0.0]])


@dataclass
class CameraPose:
    """Pose de una foto en la convención de COLMAP/OpenCV: x_cámara = rotation @ x_mundo + translation,
    con la cámara mirando hacia +z y el eje y de la imagen apuntando hacia abajo."""

    image: str
    rotation: np.ndarray  # 3x3, del mundo a la cámara
    translation: np.ndarray  # 3

    @property
    def center(self) -> np.ndarray:
        """Posición de la cámara en el mundo."""
        return -self.rotation.T @ self.translation

    @property
    def forward(self) -> np.ndarray:
        """Hacia dónde mira la cámara (unitario)."""
        return self.rotation[2]

    @property
    def down(self) -> np.ndarray:
        """Eje "abajo" de la imagen expresado en el mundo (unitario)."""
        return self.rotation[1]


@dataclass
class Calibration:
    """Intrínsecos en píxeles, con el origen en la esquina superior izquierda de la imagen (el centro
    del primer píxel está en 0.5, 0.5, como en COLMAP y Agisoft).

    La distorsión usa el modelo de OpenCV (el mismo del modelo OPENCV de COLMAP). Ojo: Agisoft
    documenta sus P1 y P2 intercambiados respecto de estos p1 y p2.
    """

    width: int
    height: int
    fx: float
    fy: float
    cx: float
    cy: float
    k1: float = 0.0
    k2: float = 0.0
    k3: float = 0.0
    p1: float = 0.0
    p2: float = 0.0

    def distort(self, x: np.ndarray, y: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        """Coordenadas normalizadas sin distorsión → con distorsión."""
        r2 = x * x + y * y
        radial = 1 + self.k1 * r2 + self.k2 * r2**2 + self.k3 * r2**3
        xd = x * radial + 2 * self.p1 * x * y + self.p2 * (r2 + 2 * x * x)
        yd = y * radial + self.p1 * (r2 + 2 * y * y) + 2 * self.p2 * x * y
        return xd, yd


def look_at_point(centers: np.ndarray, forwards: np.ndarray) -> np.ndarray:
    """Punto más cercano, por mínimos cuadrados, a todos los rayos de visión de las cámaras."""
    a = np.zeros((3, 3))
    b = np.zeros(3)
    for c, d in zip(centers, forwards):
        proj = np.eye(3) - np.outer(d, d)
        a += proj
        b += proj @ c
    return np.linalg.lstsq(a, b, rcond=None)[0]


def convergence(centers: np.ndarray, forwards: np.ndarray) -> float:
    """Qué tanto miran las cámaras hacia un punto común (1 = todas apuntan exactamente ahí)."""
    target = look_at_point(centers, forwards)
    to_target = target - centers
    to_target /= np.linalg.norm(to_target, axis=1, keepdims=True)
    return float(np.mean(np.sum(to_target * forwards, axis=1)))


def rounded(v: np.ndarray, digits: int = 3) -> list[float]:
    return [round(float(x), digits) for x in v]
