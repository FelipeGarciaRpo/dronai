"""Cuadros clave de un video para reconstruirlo en 3D.

Del video se queda con la toma continua más larga (los cortes de edición rompen la reconstrucción) y, dentro de
ella, elige cuadros nítidos espaciados según cuánto se movió la imagen: lo bastante cerca para que COLMAP los
empareje y lo bastante lejos para que haya paralaje entre uno y otro.
"""

import json
import shutil
from collections import deque
from pathlib import Path

import cv2
import numpy as np

from .review import (
    DARK_MEAN,
    MIN_TRACKS,
    TRACK_FPS,
    _corners,
    _flow,
    _is_cut,
    _lk,
    _lk_through,
    _thumb,
    _video_frames,
    blur_level,
    to_work_gray,
)

KEY_FLOW = 0.04  # la imagen se movió un 4 % del ancho (percentil 90) desde el cuadro clave anterior
MAX_GAP = 1.0  # segundos máximos entre cuadros clave aunque la imagen casi no se mueva
WINDOW = 4  # cuadros recientes entre los que se elige el más nítido


def extract_keyframes(video: Path, out: Path, max_size: int = 1600, max_frames: int = 300) -> dict:
    cap = cv2.VideoCapture(str(video))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    cap.release()
    step = max(1, round(fps / TRACK_FPS))

    staging = out / "_todos"
    shutil.rmtree(staging, ignore_errors=True)
    staging.mkdir(parents=True)
    keys: list[dict] = []
    segment = 0
    recent: deque[tuple[float, float, float, np.ndarray]] = deque(maxlen=WINDOW)  # (t, desenfoque, luma, imagen)
    diffs: deque[float] = deque(maxlen=16)
    prev = prev_thumb = None
    key_t, anchor, cur, n0 = 0.0, np.empty((0, 2), np.float32), np.empty((0, 2), np.float32), 0

    def emit() -> None:
        # El más nítido de los cuadros recientes que no esté oscuro. Si todos lo están (un fundido a negro, por
        # ejemplo), no se guarda ninguno: COLMAP no puede ubicarlos.
        usable = [c for c in recent if c[2] >= DARK_MEAN]
        if not usable:
            return
        t, blur, _, bgr = min(usable, key=lambda c: c[1])
        if keys and keys[-1]["t"] == round(t, 3):
            return
        h, w = bgr.shape[:2]
        scale = min(1.0, max_size / max(h, w))
        image = cv2.resize(bgr, (round(w * scale), round(h * scale)), interpolation=cv2.INTER_AREA) if scale < 1 else bgr
        name = f"{len(keys):05d}.jpg"
        cv2.imencode(".jpg", image, [cv2.IMWRITE_JPEG_QUALITY, 92])[1].tofile(staging / name)
        keys.append({"file": name, "t": round(t, 3), "blur": round(blur, 3), "segment": segment})

    t = 0.0
    for t, bgr, skipped in _video_frames(video, step):
        gray = to_work_gray(bgr)
        recent.append((t, blur_level(gray), float(gray.mean()), bgr))
        thumb = _thumb(gray)
        diff = float(np.abs(thumb - prev_thumb).mean()) if prev_thumb is not None else 0.0
        reanchor = False
        if prev is None:
            emit()
            reanchor = True
        elif n0 < MIN_TRACKS:
            reanchor = True  # sin detalle para seguir: se vuelve a intentar con este cuadro
        else:
            nxt, ok = _lk(prev, gray, cur)
            if ok.mean() < 0.3 and skipped:
                nxt, ok = _lk_through([prev, *map(to_work_gray, skipped), gray], cur)
            if ok.mean() < 0.3:
                if _is_cut(diff, diffs):
                    # Corte de edición: empieza otra toma, que arranca con este cuadro.
                    segment += 1
                    recent.clear()
                    recent.append((t, blur_level(gray), float(gray.mean()), bgr))
                emit()
                reanchor = True
            else:
                anchor, cur = anchor[ok], nxt[ok]
                if _flow(anchor, cur, gray.shape[1]) >= KEY_FLOW or t - key_t >= MAX_GAP or len(cur) < 0.5 * n0:
                    emit()
                    reanchor = True
        if reanchor:
            key_t, anchor = t, _corners(gray)
            cur, n0 = anchor.copy(), len(anchor)
        diffs.append(diff)
        prev, prev_thumb = gray, thumb
    if recent:
        emit()  # el final de la toma también cuenta

    # La toma continua más larga.
    spans = {}
    for key in keys:
        first, last = spans.get(key["segment"], (key["t"], key["t"]))
        spans[key["segment"]] = (min(first, key["t"]), max(last, key["t"]))
    chosen = max(spans, key=lambda s: spans[s][1] - spans[s][0])
    selected = [k for k in keys if k["segment"] == chosen]
    if len(selected) > max_frames:
        selected = [selected[i] for i in np.linspace(0, len(selected) - 1, max_frames).round().astype(int)]

    images = out / "images"
    shutil.rmtree(images, ignore_errors=True)
    images.mkdir(parents=True)
    frames = []
    for i, key in enumerate(selected):
        name = f"{i:05d}.jpg"
        (staging / key["file"]).replace(images / name)
        frames.append({"file": name, "t": key["t"], "blur": key["blur"]})
    shutil.rmtree(staging)

    start, end = spans[chosen]
    info = {
        "video": video.name,
        "fps": round(fps, 3),
        "duration": round(t, 2),
        "segment": {"index": chosen, "count": len(spans), "start": start, "end": end},
        "frames": frames,
    }
    (out / "keyframes.json").write_text(json.dumps(info, ensure_ascii=False, indent=1), encoding="utf-8")
    takes = f"la toma continua más larga de {len(spans)}" if len(spans) > 1 else "una sola toma continua"
    print(f"{len(frames)} cuadros clave de {takes} ({start:.1f}–{end:.1f} s) en {images}")
    return info
