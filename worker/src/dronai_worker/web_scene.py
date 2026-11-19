"""Escribe una escena para el visor web: miniaturas, nube de puntos (cada punto con su foto) y scene.json.

La usan tanto las escenas del DroneDeploy NeRF Dataset (poses del dataset, en metros) como las de video (poses
calculadas por DronAI con COLMAP, sin escala real). Las coordenadas de entrada van con el eje z hacia arriba, como
este-norte-arriba; el visor usa y hacia arriba.
"""

import json
import math
from pathlib import Path

import numpy as np

from .images import write_thumbnails
from .ply import write_points
from .scene import ENU_TO_VIEWER, Calibration, CameraPose, look_at_point, rounded
from .visibility import NEVER, best_views


def write_web_scene(
    out: Path,
    *,
    scene_id: str,
    title: str,
    source: dict,
    method: str,
    sensor: str,
    calib: Calibration,
    cameras: list[CameraPose],
    image_paths: list[Path],
    xyz: np.ndarray,
    rgb: np.ndarray,
    photos: dict,
    ordered: bool,
    metric: bool,
    total_points: int | None = None,
    extra: dict | None = None,
) -> dict:
    """`photos` trae count, width, height, start y minutes; si la escena está en metros (`metric`), se le suma la
    altura de vuelo sobre el suelo."""
    thumbs = write_thumbnails(image_paths, out / "thumbs", calib.width)

    if not metric:
        # Una nube de COLMAP trae puntos sueltos muy lejos (horizonte, ruido): se descartan los que están a más de
        # 5 veces la distancia típica de las cámaras al centro de la escena.
        centers_enu = np.stack([cam.center for cam in cameras])
        target_enu = look_at_point(centers_enu, np.stack([cam.forward for cam in cameras]))
        reach = 5 * float(np.median(np.linalg.norm(centers_enu - target_enu, axis=1)))
        keep = np.linalg.norm(xyz - target_enu, axis=1) < reach
        xyz, rgb = xyz[keep], rgb[keep]

    # Para la animación del visor: cada punto aparece con la foto que lo ve más de cerca, así que se guardan
    # ordenados por esa foto. Los que ninguna foto ve sin obstáculos aparecen con la última.
    views = best_views(xyz, cameras, calib)
    unseen = int(np.count_nonzero(views == NEVER))
    views = np.minimum(views, len(cameras) - 1)
    order = np.argsort(views, kind="stable")
    xyz, rgb, views = xyz[order], rgb[order], views[order]
    xyz = (xyz.astype(np.float64) @ ENU_TO_VIEWER.T).astype(np.float32)
    write_points(out / "points.ply", xyz, rgb, views)

    centers = np.stack([cam.center for cam in cameras]) @ ENU_TO_VIEWER.T
    forwards = np.stack([cam.forward for cam in cameras]) @ ENU_TO_VIEWER.T
    ups = -np.stack([cam.down for cam in cameras]) @ ENU_TO_VIEWER.T
    target = look_at_point(centers, forwards)
    median_distance = float(np.median(np.linalg.norm(centers - target, axis=1)))

    # Vista inicial en diagonal (40° de elevación) y lo bastante lejos para ver todo el recorrido.
    elevation, azimuth = math.radians(40), math.radians(45)
    view_dir = np.array(
        [math.cos(elevation) * math.sin(azimuth), math.sin(elevation), math.cos(elevation) * math.cos(azimuth)]
    )

    # Tamaño de punto ≈ separación media entre puntos sobre la planta de la escena, medida en la zona central (a menos
    # de la distancia típica de las cámaras): los puntos lejanos y dispersos de una nube de COLMAP la inflarían.
    central = xyz[np.linalg.norm(xyz - target, axis=1) < median_distance]
    sample = central if len(central) >= 1000 else xyz
    extent = np.percentile(sample, 98, axis=0) - np.percentile(sample, 2, axis=0)
    point_size = 1.5 * math.sqrt(extent[0] * extent[2] / len(sample))

    photos = dict(photos)
    if metric:
        # Altura sobre el suelo: mediana de las cámaras menos el percentil 5 de las alturas de la nube.
        photos["altitude"] = round(float(np.median(centers[:, 1])) - float(np.percentile(xyz[:, 1], 5)), 1)
    else:
        photos["altitude"] = None

    scene = {
        "id": scene_id,
        "title": title,
        "source": source,
        "method": method,
        "sensor": sensor,
        "metric": metric,
        "photos": photos,
        "points": {
            "url": "points.ply", "count": int(len(xyz)), "total": int(total_points or len(xyz)),
            "size": round(point_size, 4), "views": True,
        },
        "cameras": {
            "fovY": round(math.degrees(2 * math.atan(calib.height / 2 / calib.fy)), 2),
            "aspect": round(calib.width / calib.height, 4),
            "frustumDepth": round(median_distance * 0.025, 3),
            "orderedByTime": ordered,
            "items": [
                {"p": rounded(c), "f": rounded(f, 4), "u": rounded(u, 4), "img": f"thumbs/{name}"}
                for c, f, u, name in zip(centers, forwards, ups, thumbs)
            ],
        },
        "view": {"target": rounded(target), "position": rounded(target + view_dir * median_distance * 2.2)},
        **(extra or {}),
    }
    # Conservar los splats, las capturas del entrenamiento y la revisión si la escena ya los tenía.
    scene_path = out / "scene.json"
    if scene_path.exists():
        previous = json.loads(scene_path.read_text(encoding="utf-8"))
        scene.update({key: previous[key] for key in ("splats", "training") if key in previous})
    out.mkdir(parents=True, exist_ok=True)
    scene_path.write_text(json.dumps(scene, ensure_ascii=False, indent=1), encoding="utf-8")

    unit = "m" if metric else "unidades"
    print(f"Cámaras: {len(cameras)} ({'en orden' if ordered else 'sin orden'})")
    print(f"Distancia media de las cámaras al centro: {median_distance:.1f} {unit}")
    if metric:
        print(f"Altura sobre el suelo: {photos['altitude']} m")
    print(f"Puntos: {len(xyz):,} de {int(total_points or len(xyz)):,} · tamaño de punto {point_size:.3f} {unit}")
    print(f"Puntos que ninguna foto ve sin obstáculos (aparecen al final): {unseen:,}")
    print(f"Escena escrita en {out}")
    return scene
