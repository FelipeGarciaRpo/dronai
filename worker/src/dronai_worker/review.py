"""Revisión de una captura antes de reconstruirla: ¿alcanza para un buen 3D?

Mide en segundos y sin GPU lo que suele arruinar una reconstrucción: imágenes borrosas u oscuras, superficies sin
detalle, cortes de edición, tramos en que la cámara va tan rápido que se pierde el hilo y, sobre todo, si la cámara
se desplaza (hay paralaje) o solo gira sobre sí misma. Devuelve un veredicto de semáforo (verde, amarillo o rojo)
con los motivos y un consejo para grabar mejor.
"""

from __future__ import annotations

import json
from collections import deque
from dataclasses import asdict, dataclass
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

from .dnf import capture_time
from .images import _read

WORK_SIDE = 960  # lado mayor, en píxeles, con el que se analiza cada imagen
TRACK_FPS = 8.0  # cuadros por segundo que se siguen en un video
MAX_CORNERS = 600
MIN_TRACKS = 30
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".tif", ".tiff", ".bmp", ".webp"}

# Umbrales, calibrados con escenas del DroneDeploy NeRF Dataset y videos de Wikimedia Commons (ver worker/README.md).
BLURRY = 0.78  # desenfoque (0 nítido – 1 borroso) a partir del cual un cuadro está borroso: ~1,5 px a 960 px
DARK_MEAN = 45.0  # luma media por debajo de la cual un cuadro está oscuro...
DARK_PIXELS = 0.5  # ...o si más de la mitad de sus píxeles están casi negros
BURNT_PIXELS = 0.3  # fracción de píxeles casi blancos a partir de la cual un cuadro está quemado
TEXTURE_EIG = 0.002  # autovalor mínimo de la estructura local para que una celda cuente como "con detalle"
FLAT = 0.25  # cobertura de detalle por debajo de la cual un cuadro es liso (cielo, agua, nieve, pared)
MIN_SEGMENT = 15.0  # segundos que debe durar la toma continua más larga de un video con cortes
STILL_FLOW = 0.01  # desplazamiento (fracción del ancho) por debajo del cual la cámara está quieta
LOW_PARALLAX = 0.003  # paralaje (fracción del ancho) por debajo del cual un par se explica con un giro puro
# Focales a probar cuando no se conocen, en fracciones del ancho: de gran angular (0,4) a normal (1,5), lo que usan
# drones y celulares. No se prueban teleobjetivos a propósito: con una focal muy larga, desplazarse sobre un terreno
# plano produce casi el mismo movimiento de imagen que girar, y la revisión confundiría vuelos buenos con giros.
FOCAL_GRID = np.geomspace(0.4, 1.5, 12)

LEVELS = {"verde": 0, "amarillo": 1, "rojo": 2}
TIERS = {
    "verde": "Splats (Estándar o Fotorrealista).",
    "amarillo": "Primero el Boceto, con partes estimadas por IA; los splats solo si el boceto sale bien.",
    "rojo": "No conviene procesarla: mejor grabar de nuevo siguiendo los consejos.",
}


@dataclass
class FrameStats:
    t: float  # segundos (video) o número de foto
    blur: float  # desenfoque, de 0 (nítido) a 1 (borroso)
    brightness: float  # luma media, 0–255
    dark: float  # fracción de píxeles casi negros
    burnt: float  # fracción de píxeles casi blancos
    texture: float  # fracción de celdas con detalle

    def flags(self) -> list[str]:
        out = []
        if self.blur > BLURRY:
            out.append("borroso")
        if self.brightness < DARK_MEAN or self.dark > DARK_PIXELS:
            out.append("oscuro")
        if self.burnt > BURNT_PIXELS:
            out.append("quemado")
        if self.texture < FLAT:
            out.append("liso")
        return out


@dataclass
class PairStats:
    t0: float
    t1: float
    matches: int
    flow: float  # cuánto se movió la imagen: percentil 90 del desplazamiento, en fracción del ancho
    parallax: float  # movimiento que el mejor giro puro no explica, en fracción del ancho


def _flow(p0: np.ndarray, p1: np.ndarray, width: int) -> float:
    # Percentil 90 y no la mediana: cuando el dron rodea algo, el objeto queda centrado y casi quieto en la imagen
    # aunque el fondo se mueva mucho.
    return float(np.percentile(np.linalg.norm(p1 - p0, axis=1), 90)) / width


@dataclass
class Break:
    t: float
    kind: str  # "corte" (cambio de escena), "perdido" (se perdió el seguimiento) o "sin-solape" (fotos)


# --- Medidas por imagen -------------------------------------------------------------------------------------------


def to_work_gray(bgr: np.ndarray) -> np.ndarray:
    h, w = bgr.shape[:2]
    scale = WORK_SIDE / max(h, w)
    if scale < 1:
        bgr = cv2.resize(bgr, (round(w * scale), round(h * scale)), interpolation=cv2.INTER_AREA)
    return cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)


def texture_coverage(gray: np.ndarray, cell: int = 60) -> float:
    """Fracción de celdas de la imagen con al menos un punto fácil de seguir (esquina con contraste)."""
    eig = cv2.cornerMinEigenVal(gray, blockSize=5, ksize=3)
    rows, cols = eig.shape[0] // cell, eig.shape[1] // cell
    if rows == 0 or cols == 0:
        return 0.0
    cells = eig[: rows * cell, : cols * cell].reshape(rows, cell, cols, cell).max(axis=(1, 3))
    return float((cells > TEXTURE_EIG).mean())


def blur_level(gray: np.ndarray) -> float:
    """Desenfoque de 0 (nítido) a 1 (borroso), por "re-desenfoque" (Crété et al., 2007).

    Se desenfoca la imagen a propósito y se compara cuánto cambian las diferencias entre píxeles vecinos: una imagen
    nítida pierde mucho detalle y una ya borrosa casi nada. No depende del contraste ni de cuánto cielo liso haya,
    que es lo que confundía a la varianza del Laplaciano.
    """
    f = gray.astype(np.float32)
    levels = []
    for axis, kernel in ((0, (1, 9)), (1, (9, 1))):  # (ancho, alto) del filtro: vertical y después horizontal
        d_f = np.abs(np.diff(f, axis=axis))
        d_b = np.abs(np.diff(cv2.blur(f, kernel), axis=axis))
        total = float(d_f.sum())
        levels.append((total - float(np.maximum(0, d_f - d_b).sum())) / total if total > 0 else 1.0)
    return max(levels)


def frame_stats(gray: np.ndarray, t: float) -> FrameStats:
    n = gray.size
    return FrameStats(
        t=t,
        blur=blur_level(gray),
        brightness=float(gray.mean()),
        dark=float(np.count_nonzero(gray < 20) / n),
        burnt=float(np.count_nonzero(gray > 250) / n),
        texture=texture_coverage(gray),
    )


# --- Paralaje -----------------------------------------------------------------------------------------------------


def _bearings(points: np.ndarray, center: np.ndarray, focal: float) -> np.ndarray:
    v = np.column_stack([(points - center) / focal, np.ones(len(points))])
    return v / np.linalg.norm(v, axis=1, keepdims=True)


def _kabsch(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    """Rotación R que mejor lleva los vectores a sobre los b (b ≈ R a)."""
    u, _, vt = np.linalg.svd(b.T @ a)
    d = np.sign(np.linalg.det(u @ vt))
    return u @ np.diag([1.0, 1.0, d]) @ vt


def rotation_residual(p0: np.ndarray, p1: np.ndarray, width: int, height: int,
                      focals: np.ndarray = FOCAL_GRID) -> float:
    """Paralaje entre dos vistas: la parte del movimiento de la imagen que ningún giro puro de la cámara explica.

    Si la cámara solo gira, todos los puntos se mueven como en una rotación y el residuo es ~0 con la focal correcta.
    Si se desplaza, lo cercano y lo lejano se mueven distinto y ningún giro lo explica. Si la focal no se conoce, se
    prueban varias (en fracciones del ancho) y se queda la que mejor explica el movimiento como giro.

    Devuelve la mediana del residuo en fracción del ancho de la imagen. No se usan grados a propósito: pasar píxeles
    a grados depende de la focal, que justamente no se conoce, y la misma imagen daría cifras muy distintas.
    """
    center = np.array([width / 2, height / 2])
    best = np.inf
    for k in focals:
        focal = k * width
        b0, b1 = _bearings(p0, center, focal), _bearings(p1, center, focal)
        keep = np.ones(len(b0), bool)
        for _ in range(3):  # se recorta el 20 % peor para que unos pocos seguimientos malos no tuerzan el ajuste
            pred = b0 @ _kabsch(b0[keep], b1[keep]).T
            ok = pred[:, 2] > 1e-6
            px = np.full(len(b0), np.inf)
            px[ok] = np.linalg.norm(pred[ok, :2] / pred[ok, 2:3] * focal + center - p1[ok], axis=1)
            keep = px <= np.quantile(px, 0.8)
        best = min(best, float(np.median(px)))
    return best / width


# --- Videos -------------------------------------------------------------------------------------------------------

LK = dict(winSize=(21, 21), maxLevel=3, criteria=(cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 30, 0.01))


def _corners(gray: np.ndarray) -> np.ndarray:
    pts = cv2.goodFeaturesToTrack(gray, MAX_CORNERS, 0.01, 10)
    return np.empty((0, 2), np.float32) if pts is None else pts.reshape(-1, 2)


def _lk(g0: np.ndarray, g1: np.ndarray, p0: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Sigue puntos de g0 a g1 y descarta los que no vuelven a su lugar al seguirlos de regreso."""
    p1, st1, _ = cv2.calcOpticalFlowPyrLK(g0, g1, p0.reshape(-1, 1, 2), None, **LK)
    back, st2, _ = cv2.calcOpticalFlowPyrLK(g1, g0, p1, None, **LK)
    p1 = p1.reshape(-1, 2)
    h, w = g1.shape
    ok = (st1.ravel() == 1) & (st2.ravel() == 1) & (np.linalg.norm(back.reshape(-1, 2) - p0, axis=1) < 1.0)
    ok &= (p1[:, 0] >= 0) & (p1[:, 0] < w) & (p1[:, 1] >= 0) & (p1[:, 1] < h)
    return p1, ok


def _thumb(gray: np.ndarray) -> np.ndarray:
    return cv2.resize(gray, (64, 36), interpolation=cv2.INTER_AREA).astype(np.float32)


def _is_cut(diff: float, recent: deque[float]) -> bool:
    """Cuando se pierde el seguimiento, ¿fue un corte de edición o la cámara se movió demasiado rápido?

    Es un corte si la imagen cambió de golpe mucho más que en los cuadros anteriores: los 31 cortes del showreel de
    prueba saltan al menos 3,5 veces la mediana reciente. Comparar histogramas de brillo daba falsos cortes cuando un
    dron FPV pasa rápido entre cuartos con distinta luz.
    """
    return diff > max(25.0, 3 * float(np.median(recent))) if recent else diff > 25.0


def _video_frames(path: Path, step: int):
    """Da un cuadro de cada `step`, junto con los cuadros intermedios que se saltaron (para reintentar el seguimiento)."""
    cap = cv2.VideoCapture(str(path))
    if not cap.isOpened():
        raise ValueError(f"No se pudo abrir el video {path}")
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    index = 0
    skipped: list[np.ndarray] = []
    while cap.grab():
        ok, bgr = cap.retrieve()
        if ok:
            if index % step == 0:
                yield index / fps, bgr, skipped
                skipped = []
            else:
                skipped.append(bgr)
        index += 1
    cap.release()


def _lk_through(frames: list[np.ndarray], p0: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Sigue puntos a lo largo de varios cuadros seguidos; un punto sobrevive si nunca se perdió."""
    pts, alive = p0, np.ones(len(p0), bool)
    for g0, g1 in zip(frames, frames[1:]):
        pts, ok = _lk(g0, g1, pts)
        alive &= ok
    return pts, alive


def _review_video(path: Path) -> tuple[dict, list[FrameStats], list[PairStats], list[Break]]:
    cap = cv2.VideoCapture(str(path))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    width, height = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    cap.release()
    step = max(1, round(fps / TRACK_FPS))

    frames: list[FrameStats] = []
    pairs: list[PairStats] = []
    breaks: list[Break] = []
    diffs: deque[float] = deque(maxlen=16)
    prev = prev_thumb = None
    key_t, anchor, cur, n0 = 0.0, np.empty((0, 2), np.float32), np.empty((0, 2), np.float32), 0
    t = 0.0
    for t, bgr, skipped in _video_frames(path, step):
        gray = to_work_gray(bgr)
        frames.append(frame_stats(gray, t))
        thumb = _thumb(gray)
        diff = float(np.abs(thumb - prev_thumb).mean()) if prev_thumb is not None else 0.0
        if prev is None or n0 < MIN_TRACKS:
            key_t, anchor = t, _corners(gray)
            cur, n0 = anchor.copy(), len(anchor)
        else:
            nxt, ok = _lk(prev, gray, cur)
            if ok.mean() < 0.3 and skipped:
                # Con 8 cuadros por segundo una cámara rápida se mueve demasiado entre uno y otro: antes de dar el
                # hilo por perdido se reintenta pasando por los cuadros intermedios.
                nxt, ok = _lk_through([prev, *map(to_work_gray, skipped), gray], cur)
            if ok.mean() < 0.3:
                # Se perdió el hilo de golpe. Si además la imagen cambió mucho más que en los cuadros anteriores,
                # es un corte de edición; si no, la cámara se movió demasiado rápido (o la imagen está muy borrosa).
                breaks.append(Break(t, "corte" if _is_cut(diff, diffs) else "perdido"))
                key_t, anchor = t, _corners(gray)
                cur, n0 = anchor.copy(), len(anchor)
            else:
                anchor, cur = anchor[ok], nxt[ok]
                flow = _flow(anchor, cur, gray.shape[1])
                # Cada tramo dura hasta 4 s o hasta que la imagen cambió bastante: con tramos más cortos, un dron
                # que vuela lejos apenas se desplaza y parecería que solo gira.
                if flow > 0.3 or len(cur) < 0.4 * n0 or t - key_t >= 4.0:
                    if len(cur) >= MIN_TRACKS:
                        pairs.append(PairStats(key_t, t, len(cur), flow,
                                               rotation_residual(anchor, cur, gray.shape[1], gray.shape[0])))
                    key_t, anchor = t, _corners(gray)
                    cur, n0 = anchor.copy(), len(anchor)
        diffs.append(diff)
        prev, prev_thumb = gray, thumb

    if not frames:
        raise ValueError(f"El video {path} no tiene cuadros legibles")
    source = {"kind": "video", "name": path.name, "width": width, "height": height, "fps": round(fps, 2),
              "duration": round(t + step / fps, 1), "count": len(frames)}
    return source, frames, pairs, breaks


# --- Fotos --------------------------------------------------------------------------------------------------------


def _list_photos(folder: Path) -> list[Path]:
    if (folder / "images").is_dir():
        folder = folder / "images"
    paths = [p for p in folder.iterdir() if p.suffix.lower() in IMAGE_EXTENSIONS]
    times = {p: capture_time(p) for p in paths}
    # Orden del vuelo: por hora de captura si todas la tienen; si no, por nombre.
    if all(times.values()):
        return sorted(paths, key=lambda p: (times[p], p.name))
    return sorted(paths)


def focal_ratio(path: Path) -> float | None:
    """Focal en fracción del ancho según el EXIF (FocalLengthIn35mmFilm, referida a la diagonal de 43,27 mm)."""
    try:
        with Image.open(path) as img:
            f35 = img.getexif().get_ifd(0x8769).get(0xA405)
            w, h = img.size
    except OSError:
        return None
    if not f35:
        return None
    return float(f35) / 43.27 * float(np.hypot(w, h)) / w


def _read_work(path: Path) -> np.ndarray:
    with Image.open(path) as img:
        side = max(img.size)
    factor = next(f for f in (8, 4, 2, 1) if side / f >= WORK_SIDE or f == 1)
    return _read(path, factor)


def _match(a, b) -> tuple[np.ndarray, np.ndarray]:
    (kp0, des0), (kp1, des1) = a, b
    if des0 is None or des1 is None or len(kp0) < 2 or len(kp1) < 2:
        return np.empty((0, 2)), np.empty((0, 2))
    good = [m for m, n in cv2.BFMatcher(cv2.NORM_L2).knnMatch(des0, des1, k=2) if m.distance < 0.75 * n.distance]
    if len(good) < 8:
        return np.empty((0, 2)), np.empty((0, 2))
    p0 = np.float32([kp0[m.queryIdx].pt for m in good])
    p1 = np.float32([kp1[m.trainIdx].pt for m in good])
    _, mask = cv2.findFundamentalMat(p0, p1, cv2.USAC_MAGSAC, 1.5, 0.999)
    if mask is None:
        return np.empty((0, 2)), np.empty((0, 2))
    keep = mask.ravel() == 1
    return p0[keep], p1[keep]


def _review_photos(folder: Path) -> tuple[dict, list[FrameStats], list[PairStats], list[Break]]:
    paths = _list_photos(folder)
    if not paths:
        raise ValueError(f"No hay fotos en {folder}")
    sift = cv2.SIFT_create(nfeatures=2000)
    frames: list[FrameStats] = []
    pairs: list[PairStats] = []
    breaks: list[Break] = []
    prev = None
    with Image.open(paths[0]) as img:
        width, height = img.size
    # Si las fotos dicen su focal, se usa esa (con un margen) en vez de probar todas.
    ratio = focal_ratio(paths[0])
    focals = FOCAL_GRID if ratio is None else ratio * np.geomspace(0.87, 1.15, 5)
    for i, path in enumerate(paths):
        gray = to_work_gray(_read_work(path))
        frames.append(frame_stats(gray, i))
        features = sift.detectAndCompute(gray, None)
        if prev is not None:
            p0, p1 = _match(prev, features)
            if len(p0) < MIN_TRACKS:
                breaks.append(Break(i, "sin-solape"))
            else:
                parallax = rotation_residual(p0, p1, gray.shape[1], gray.shape[0], focals)
                pairs.append(PairStats(i - 1, i, len(p0), _flow(p0, p1, gray.shape[1]), parallax))
        prev = features
    source = {"kind": "photos", "name": folder.name, "width": width, "height": height, "count": len(paths),
              "focal": None if ratio is None else round(ratio, 3)}
    return source, frames, pairs, breaks


# --- Veredicto ----------------------------------------------------------------------------------------------------


def motion(pair: PairStats) -> str:
    """Qué hizo la cámara en un tramo: "quieto", "gira" (sin desplazarse) o "avanza" (se desplaza: hay paralaje)."""
    if pair.flow < STILL_FLOW:
        return "quieto"
    return "gira" if pair.parallax < LOW_PARALLAX else "avanza"


def summarize(source: dict, frames: list[FrameStats], pairs: list[PairStats], breaks: list[Break]) -> dict:
    """Reduce las medidas por cuadro y por par a unas pocas cifras que decide el semáforo."""
    flags = [f.flags() for f in frames]
    share = lambda name: sum(name in f for f in flags) / len(frames)  # noqa: E731
    moving = [p for p in pairs if p.flow >= STILL_FLOW]
    weight = (lambda p: p.t1 - p.t0) if source["kind"] == "video" else (lambda p: 1.0)
    total = sum(weight(p) for p in pairs) or 1.0
    moving_total = sum(weight(p) for p in moving) or 1.0
    advancing = sum(weight(p) for p in pairs if motion(p) == "avanza") / total if pairs else None

    cuts = [b.t for b in breaks if b.kind == "corte"]
    if source["kind"] == "video":
        edges = [0.0, *cuts, source["duration"]]
        longest = max(b - a for a, b in zip(edges, edges[1:]))
    else:
        longest = None
    return {
        # Lo que sale bien, para mostrarlo (fracciones de 0 a 1).
        "sharp": 1 - share("borroso"),
        "lit": sum(not ({"oscuro", "quemado"} & set(f)) for f in flags) / len(frames),
        "detailed": 1 - share("liso"),
        "moving": advancing,
        # Lo que sale mal, para decidir.
        "frames": len(frames),
        "blurry": share("borroso"),
        "dark": share("oscuro"),
        "burnt": share("quemado"),
        "flat": share("liso"),
        "usable": sum(not f for f in flags) / len(frames),
        "pairs": len(pairs),
        "still": sum(weight(p) for p in pairs if p.flow < STILL_FLOW) / total,
        "rotation": sum(weight(p) for p in moving if p.parallax < LOW_PARALLAX) / moving_total if moving else None,
        "parallax": float(np.median([p.parallax for p in moving])) if moving else None,
        "cuts": len(cuts),
        "lost": sum(b.kind == "perdido" for b in breaks),
        "noOverlap": sum(b.kind == "sin-solape" for b in breaks) / max(1, len(frames) - 1),
        "longestSegment": longest,
    }


def _pct(x: float) -> str:
    return f"{round(100 * x)} %"


def _num(x: float, digits: int = 1) -> str:
    return f"{x:.{digits}f}".replace(".", ",")


def judge(source: dict, m: dict) -> list[dict]:
    """Lista de problemas encontrados, cada uno con su nivel (amarillo o rojo), qué pasa y cómo arreglarlo."""
    issues: list[dict] = []
    photos = source["kind"] == "photos"
    unit = "de las fotos" if photos else "del video"

    def add(code: str, level: str, message: str, tip: str) -> None:
        issues.append({"code": code, "level": level, "message": message, "tip": tip})

    def by_share(code: str, value: float, red: float, yellow: float, message: str, tip: str) -> None:
        if value >= red:
            add(code, "rojo", message, tip)
        elif value >= yellow:
            add(code, "amarillo", message, tip)

    if photos and source["count"] < 20:
        add("pocas", "rojo", f"Solo hay {source['count']} fotos; hacen falta al menos 20 que se solapen.",
            "Toma más fotos alrededor del lugar, cada una compartiendo unos dos tercios con la anterior.")
    if not photos and source["duration"] < 10:
        add("corta", "rojo", f"El video dura {_num(source['duration'])} s; hace falta al menos medio minuto.",
            "Graba al menos 30 segundos recorriendo o rodeando el lugar.")

    by_share("oscuro", m["dark"], 0.6, 0.25, f"El {_pct(m['dark'])} {unit} está demasiado oscuro.",
             "Graba de día o con buena luz; de noche la cámara no capta detalle.")
    by_share("borroso", m["blurry"], 0.6, 0.25, f"El {_pct(m['blurry'])} {unit} está borroso.",
             "Muévete más despacio; con poca luz la cámara usa exposiciones largas y todo sale movido.")
    by_share("quemado", m["burnt"], 0.8, 0.4, f"El {_pct(m['burnt'])} {unit} tiene zonas quemadas (casi blancas).",
             "Evita el contraluz y el sol de frente.")
    by_share("liso", m["flat"], 0.7, 0.35, f"El {_pct(m['flat'])} {unit} es casi liso: cielo, agua, nieve o paredes.",
             "Encuadra zonas con detalle y evita que el cielo o una pared lisa llenen la imagen.")

    if not photos and m["still"] >= 0.8:
        add("quieto", "rojo", "La cámara casi no se mueve, así que no hay cómo medir profundidad.",
            "Desplázate: rodea el lugar o recórrelo despacio.")
    elif m["rotation"] is not None:
        if m["rotation"] >= 0.7:
            add("solo-gira", "rojo", "La cámara casi solo gira sobre sí misma, sin desplazarse.",
                "Para medir profundidad hay que cambiar de posición: rodea el lugar o avanza, en vez de girar en el "
                "mismo punto.")
        elif m["rotation"] >= 0.35:
            add("solo-gira", "amarillo", f"En el {_pct(m['rotation'])} de los tramos la cámara solo gira, sin desplazarse.",
                "Gira mientras avanzas, en vez de girar en el mismo punto.")
    elif m["pairs"] == 0:
        add("sin-seguimiento", "rojo", "No se pudo seguir ningún detalle de una imagen a la siguiente.",
            "Graba más despacio, con buena luz y encuadrando zonas con detalle.")

    # Un corte solo importa si la toma continua más larga deja afuera una buena parte del video (no, por ejemplo,
    # un fundido a negro al final).
    if m["cuts"] and m["longestSegment"] < 0.8 * source["duration"]:
        longest = m["longestSegment"]
        if longest < MIN_SEGMENT:
            add("cortes", "rojo", f"Es un montaje de {m['cuts'] + 1} tomas; la más larga dura {_num(longest)} s.",
                "Sube una sola toma continua, sin editar, de al menos 30 segundos.")
        else:
            add("cortes", "amarillo", f"El video tiene {m['cuts']} cortes de edición; se usará la toma continua más "
                f"larga, de {_num(longest)} s.", "Sube la toma original, sin editar: cada corte rompe la continuidad.")
    if not photos and source["duration"] > 0:
        per_minute = m["lost"] / (source["duration"] / 60)
        if per_minute >= 3:
            add("rapido", "rojo" if per_minute >= 20 else "amarillo",
                f"En {m['lost']} momentos la cámara se movió tan rápido que se perdió el hilo.",
                "Vuela o camina más despacio, sobre todo al girar.")
    if photos:
        by_share("sin-solape", m["noOverlap"], 0.6, 0.3, f"El {_pct(m['noOverlap'])} de las fotos no comparte casi "
                 "nada con la anterior.", "Toma las fotos más seguidas: cada una debería compartir unos dos tercios "
                 "con la anterior.")
    return issues


def _summary_text(source: dict, m: dict, verdict: str, issues: list[dict]) -> str:
    if verdict == "verde":
        if source["kind"] == "photos":
            return (f"{source['count']} fotos nítidas, bien iluminadas y con detalle; la cámara se desplaza entre "
                    "una y otra.")
        return (f"{_num(source['duration'], 0)} s de video nítido, bien iluminado y con detalle; la cámara se desplaza, "
                "no solo gira.")
    worst = sorted(issues, key=lambda i: -LEVELS[i["level"]])
    return " ".join(i["message"] for i in worst[:2])


def _thin(items: list, limit: int) -> list:
    if len(items) <= limit:
        return items
    idx = np.linspace(0, len(items) - 1, limit).round().astype(int)
    return [items[i] for i in idx]


def review_capture(source_path: Path) -> dict:
    """Revisa un video o una carpeta de fotos y devuelve el informe completo (lo que se guarda como JSON)."""
    if source_path.is_dir():
        source, frames, pairs, breaks = _review_photos(source_path)
    else:
        source, frames, pairs, breaks = _review_video(source_path)
    metrics = summarize(source, frames, pairs, breaks)
    issues = judge(source, metrics)
    verdict = max((i["level"] for i in issues), key=LEVELS.get, default="verde")
    rounded = {k: (round(v, 5) if isinstance(v, float) else v) for k, v in metrics.items()}
    return {
        "version": 1,
        "source": source,
        "verdict": verdict,
        "summary": _summary_text(source, metrics, verdict, issues),
        "tier": TIERS[verdict],
        "issues": issues,
        "metrics": rounded,
        "timeline": [
            {"t": round(f.t, 2), "blur": round(f.blur, 3), "brightness": round(f.brightness),
             "texture": round(f.texture, 2), "flags": f.flags()}
            for f in _thin(frames, 400)
        ],
        "pairs": [
            {**asdict(p), "flow": round(p.flow, 3), "parallax": round(p.parallax, 5), "motion": motion(p)}
            for p in _thin(pairs, 400)
        ],
        "breaks": [asdict(b) for b in breaks],
    }


def write_frames(video: Path, out_dir: Path, count: int, width: int = 480) -> list[dict]:
    """Guarda `count` cuadros repartidos a lo largo del video, para mostrar junto al informe."""
    cap = cv2.VideoCapture(str(video))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    out_dir.mkdir(parents=True, exist_ok=True)
    thumbs = []
    for k, index in enumerate(np.linspace(0, max(0, total - 2), count).astype(int)):
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(index))
        ok, bgr = cap.read()
        if not ok:
            continue
        h, w = bgr.shape[:2]
        small = cv2.resize(bgr, (width, round(h * width / w)), interpolation=cv2.INTER_AREA)
        name = f"{k:02d}.jpg"
        cv2.imencode(".jpg", small, [cv2.IMWRITE_JPEG_QUALITY, 80])[1].tofile(out_dir / name)
        thumbs.append({"t": round(index / fps, 2), "url": f"{out_dir.name}/{name}"})
    cap.release()
    return thumbs


def print_report(report: dict) -> None:
    s, m = report["source"], report["metrics"]
    what = f"{s['count']} fotos" if s["kind"] == "photos" else f"video de {_num(s['duration'], 0)} s"
    print(f"{s['name']} ({what}, {s['width']}×{s['height']})")
    print(f"  Veredicto: {report['verdict'].upper()}. {report['summary']}")
    for issue in report["issues"]:
        print(f"  · [{issue['level']}] {issue['message']} {issue['tip']}")
    par = "–" if m["parallax"] is None else f"{_num(100 * m['parallax'], 2)} % del ancho"
    rot = "–" if m["rotation"] is None else _pct(m["rotation"])
    print(f"  Medidas: borroso {_pct(m['blurry'])}, oscuro {_pct(m['dark'])}, quemado {_pct(m['burnt'])}, "
          f"liso {_pct(m['flat'])}, "
          f"quieto {_pct(m['still'])}, solo gira {rot}, paralaje {par}, cortes {m['cuts']}, "
          f"perdidos {m['lost']}, pares {m['pairs']}")
    print(f"  Nivel sugerido: {report['tier']}")


def write_report(report: dict, out: Path) -> None:
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
