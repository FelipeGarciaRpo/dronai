import argparse
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(prog="dronai-worker", description="Pipeline de reconstrucción 3D de DronAI.")
    sub = parser.add_subparsers(dest="command", required=True)

    dnf = sub.add_parser("dnf-import", help="Prepara una escena del DroneDeploy NeRF Dataset para el visor web.")
    dnf.add_argument("dataset", type=Path, help="Carpeta de la escena (con cameras.xml, images/ y points/points.ply)")
    dnf.add_argument("out", type=Path, help="Carpeta de salida, por ejemplo web/public/scenes/house1")
    dnf.add_argument("--id", required=True, help="Identificador de la escena")
    dnf.add_argument("--title", required=True, help="Título visible en el visor")
    dnf.add_argument("--max-points", type=int, default=1_500_000, help="Máximo de puntos a conservar")

    train = sub.add_parser(
        "dnf-train-data",
        help="Prepara una escena del DNF para entrenar Gaussian splats con sus poses (formato COLMAP).",
    )
    train.add_argument("dataset", type=Path, help="Carpeta de la escena (con cameras.xml, images/ y points/points.ply)")
    train.add_argument("out", type=Path, help="Carpeta de salida: quedan images/ y sparse/0/")
    train.add_argument("--max-size", type=int, default=1600, help="Lado mayor de las fotos, en píxeles")
    train.add_argument("--init-points", type=int, default=300_000, help="Puntos de la nube densa para inicializar")

    splats = sub.add_parser("splats-export", help="Convierte splats entrenados (PLY de 3DGS) a .splat y los suma a una escena.")
    splats.add_argument("ply", type=Path, help="PLY exportado por el entrenador (Brush, gsplat, ...)")
    splats.add_argument("scene_dir", type=Path, help="Carpeta de la escena web, con su scene.json")
    splats.add_argument("--method", required=True, help="Cómo se entrenaron, para mostrarlo en el visor")
    splats.add_argument("--min-opacity", type=float, default=0.01, help="Opacidad mínima para conservar un splat")
    splats.add_argument("--max-radius", type=float, default=3.0, help="Distancia máxima al centro, en radios del 98 %%")

    training = sub.add_parser("splats-training", help="Convierte capturas intermedias del entrenamiento para el visor.")
    training.add_argument("snapshots", type=Path, help="Carpeta con los export_<paso>.ply de Brush")
    training.add_argument("scene_dir", type=Path, help="Carpeta de la escena web, con su scene.json")
    training.add_argument("--steps", required=True, help="Pasos a convertir, separados por comas (ej. 500,1000,7000)")
    training.add_argument("--total-steps", type=int, required=True, help="Pasos totales del entrenamiento")
    training.add_argument("--min-opacity", type=float, default=0.01)
    training.add_argument("--max-radius", type=float, default=3.0)

    review = sub.add_parser(
        "review",
        help="Revisa un video o una carpeta de fotos antes de reconstruir: semáforo verde, amarillo o rojo con motivos.",
    )
    review.add_argument("sources", type=Path, nargs="+", help="Videos o carpetas de fotos (o con una subcarpeta images/)")
    review.add_argument("--out", type=Path, help="Archivo JSON donde guardar el informe (solo con una entrada)")
    review.add_argument("--frames", type=int, default=0,
                        help="En un video, guardar N cuadros de muestra en frames/ junto al informe")

    keyframes = sub.add_parser("keyframes", help="Elige los cuadros clave de un video para reconstruirlo con COLMAP.")
    keyframes.add_argument("video", type=Path)
    keyframes.add_argument("workdir", type=Path, help="Carpeta de trabajo: quedan images/ y keyframes.json")
    keyframes.add_argument("--max-size", type=int, default=1600, help="Lado mayor de los cuadros, en píxeles")
    keyframes.add_argument("--max-frames", type=int, default=300, help="Máximo de cuadros clave")

    colmap = sub.add_parser(
        "colmap-import",
        help="Alinea el modelo de COLMAP (workdir/undistorted) y escribe la escena web y los datos de entrenamiento.",
    )
    colmap.add_argument("workdir", type=Path, help="Carpeta de trabajo con keyframes.json y undistorted/")
    colmap.add_argument("out", type=Path, help="Carpeta de la escena web, por ejemplo web/public/scenes/kallang")
    colmap.add_argument("--id", required=True)
    colmap.add_argument("--title", required=True)
    colmap.add_argument("--sensor", default="Video", help="Cámara o tipo de captura, para mostrar en la galería")
    colmap.add_argument("--source-name", required=True, help="Autor o fuente del video")
    colmap.add_argument("--source-url", default="")
    colmap.add_argument("--license", required=True)

    pack = sub.add_parser("kaggle-pack", help="Empaqueta una escena (images/ y sparse/0/) en un zip para subirlo a Kaggle.")
    pack.add_argument("scene", type=Path, help="Carpeta con images/ y sparse/0/, por ejemplo data/prepared/kallang/aligned")
    pack.add_argument("zip", type=Path, help="Archivo .zip de salida")
    pack.add_argument("--name", required=True, help="Nombre de la carpeta de la escena dentro del zip (SCENE en el notebook)")

    args = parser.parse_args()
    if args.command == "kaggle-pack":
        import zipfile

        files = [p for p in sorted((args.scene / "images").iterdir()) if p.is_file()]
        files += sorted((args.scene / "sparse" / "0").glob("*.bin"))
        args.zip.parent.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(args.zip, "w", zipfile.ZIP_STORED) as z:  # las fotos ya vienen comprimidas
            for path in files:
                z.write(path, f"{args.name}/{path.relative_to(args.scene).as_posix()}")
        print(f"{args.zip}: {len(files)} archivos, {args.zip.stat().st_size / 1e6:.1f} MB")
    elif args.command == "keyframes":
        from .keyframes import extract_keyframes

        extract_keyframes(args.video, args.workdir, max_size=args.max_size, max_frames=args.max_frames)
    elif args.command == "colmap-import":
        from .colmap_scene import import_colmap

        source = {"name": args.source_name, "url": args.source_url, "license": args.license}
        import_colmap(args.workdir, args.out, scene_id=args.id, title=args.title, source=source, sensor=args.sensor)
    elif args.command == "review":
        import sys

        from .review import print_report, review_capture, write_frames, write_report

        sys.stdout.reconfigure(encoding="utf-8")
        if args.out and len(args.sources) > 1:
            parser.error("--out solo funciona con una entrada")
        for source in args.sources:
            report = review_capture(source)
            print_report(report)
            if args.out:
                if args.frames and source.is_file():
                    report["thumbs"] = write_frames(source, args.out.parent / "frames", args.frames)
                write_report(report, args.out)
    elif args.command == "dnf-import":
        from .dnf import import_scene

        import_scene(args.dataset, args.out, scene_id=args.id, title=args.title, max_points=args.max_points)
    elif args.command == "dnf-train-data":
        from .dnf import export_training_data

        export_training_data(args.dataset, args.out, max_size=args.max_size, init_points=args.init_points)
    elif args.command == "splats-export":
        from .splats import export_splats

        export_splats(args.ply, args.scene_dir, method=args.method, min_opacity=args.min_opacity,
                      max_radius=args.max_radius)
    elif args.command == "splats-training":
        from .splats import export_training

        steps = [int(s) for s in args.steps.split(",")]
        export_training(args.snapshots, args.scene_dir, steps, total_steps=args.total_steps,
                        min_opacity=args.min_opacity, max_radius=args.max_radius)
