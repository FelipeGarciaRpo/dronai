"""Exportación de Gaussian splats entrenados (PLY estándar de 3DGS) al formato .splat para el visor web.

El .splat guarda 32 bytes por splat: posición y escala (float32), color y opacidad (uint8) y rotación
(cuaternión en uint8). No conserva los armónicos esféricos: el color no cambia con el ángulo de vista.
"""

import json
from pathlib import Path

import numpy as np

from .ply import read_vertices

SH_C0 = 0.28209479177387814  # armónico esférico de grado 0


def _sigmoid(x: np.ndarray) -> np.ndarray:
    return 1 / (1 + np.exp(-x))


def convert_splats(ply: Path, out: Path, min_opacity: float, max_radius: float) -> tuple[int, int]:
    """Convierte un PLY de 3DGS a .splat y devuelve (splats guardados, splats en el PLY).

    Se descartan los casi transparentes (opacidad < min_opacity) y los que quedan más lejos del centro
    que max_radius veces el radio que contiene al 98 % de los splats.
    """
    v = read_vertices(ply)
    xyz = np.stack([v["x"], v["y"], v["z"]], axis=1).astype(np.float32)
    log_scale = np.stack([v[f"scale_{i}"] for i in range(3)], axis=1).astype(np.float32)
    rot = np.stack([v[f"rot_{i}"] for i in range(4)], axis=1).astype(np.float32)  # (w, x, y, z)
    dc = np.stack([v[f"f_dc_{i}"] for i in range(3)], axis=1).astype(np.float32)
    opacity = _sigmoid(v["opacity"].astype(np.float32))
    total = len(xyz)

    finite = np.all(np.isfinite(np.concatenate([xyz, log_scale, rot, dc], axis=1)), axis=1)
    center = np.median(xyz[finite], axis=0)
    dist = np.linalg.norm(xyz - center, axis=1)
    radius = float(np.percentile(dist[finite], 98))
    keep = finite & (opacity >= min_opacity) & (dist <= radius * max_radius) & (np.linalg.norm(rot, axis=1) > 0)

    xyz, log_scale, rot, dc, opacity = xyz[keep], log_scale[keep], rot[keep], dc[keep], opacity[keep]
    # Primero los splats que más se ven (volumen x opacidad), como en el formato original de antimatter15.
    order = np.argsort(-(np.exp(log_scale.sum(axis=1)) * opacity))

    data = np.zeros(len(order), dtype=[("pos", "<f4", 3), ("scale", "<f4", 3), ("rgba", "u1", 4), ("rot", "u1", 4)])
    data["pos"] = xyz[order]
    data["scale"] = np.exp(log_scale[order])
    data["rgba"][:, :3] = np.clip(np.round((0.5 + SH_C0 * dc[order]) * 255), 0, 255)
    data["rgba"][:, 3] = np.clip(np.round(opacity[order] * 255), 0, 255)
    q = rot[order] / np.linalg.norm(rot[order], axis=1, keepdims=True)
    data["rot"] = np.clip(np.round(q * 128 + 128), 0, 255)

    out.parent.mkdir(parents=True, exist_ok=True)
    data.tofile(out)
    return int(len(data)), int(total)


def _update_scene(scene_dir: Path, key: str, value: object) -> Path:
    scene_path = scene_dir / "scene.json"
    scene = json.loads(scene_path.read_text(encoding="utf-8"))
    scene[key] = value
    scene_path.write_text(json.dumps(scene, ensure_ascii=False, indent=1), encoding="utf-8")
    return scene_path


def export_splats(ply: Path, scene_dir: Path, method: str, min_opacity: float, max_radius: float) -> dict:
    """Guarda los splats finales como scene_dir/splats.splat y los agrega a scene.json."""
    out = scene_dir / "splats.splat"
    count, total = convert_splats(ply, out, min_opacity, max_radius)
    # "frame": "enu" → el archivo está en metros este-norte-arriba; el visor lo gira a sus ejes (Y arriba).
    entry = {"url": out.name, "count": count, "total": total, "frame": "enu", "method": method}
    scene_path = _update_scene(scene_dir, "splats", entry)
    print(f"Splats: {count:,} de {total:,} · splats.splat de {out.stat().st_size / 1e6:.1f} MB")
    print(f"Escena actualizada: {scene_path}")
    return entry


def export_training(snapshots: Path, scene_dir: Path, steps: list[int], total_steps: int,
                    min_opacity: float, max_radius: float) -> list[dict]:
    """Convierte las capturas intermedias del entrenamiento (export_<paso>.ply de Brush) para que el visor
    muestre cómo la escena pasa de manchas borrosas a la imagen nítida."""
    # Brush nombra las capturas export_<paso>.ply, a veces con ceros a la izquierda (export_0500.ply).
    available = {int(p.stem.removeprefix("export_")): p for p in snapshots.glob("export_*.ply")
                 if p.stem.removeprefix("export_").isdigit()}
    missing = [step for step in steps if step not in available]
    if missing:
        raise FileNotFoundError(f"No hay capturas para los pasos {missing} en {snapshots}")

    entries = []
    for step in steps:
        out = scene_dir / "training" / f"{step:05d}.splat"
        count, _ = convert_splats(available[step], out, min_opacity, max_radius)
        entries.append({"step": step, "url": f"training/{out.name}", "count": count})
        print(f"Paso {step:>5}: {count:,} splats · {out.stat().st_size / 1e6:.1f} MB")
    scene_path = _update_scene(scene_dir, "training", {"totalSteps": total_steps, "frame": "enu", "snapshots": entries})
    print(f"Escena actualizada: {scene_path}")
    return entries
