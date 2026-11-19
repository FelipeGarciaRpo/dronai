import { DATASETS, type Dataset } from "@/components/reconstruction/datasets";
import abadia from "../../../public/scenes/abadia/scene.json";
import house1 from "../../../public/scenes/house1/scene.json";
import house3 from "../../../public/scenes/house3/scene.json";
import kallang from "../../../public/scenes/kallang/scene.json";
import pipes1 from "../../../public/scenes/pipes1/scene.json";

// Lo que la portada muestra de cada escena. Las cifras salen de scene.json, el archivo que genera el worker; este
// módulo solo se usa en el servidor, para que los scene.json completos no viajen al navegador.

export type LandingScene = {
  id: string;
  title: string;
  place: string;
  sceneUrl: string;
  /** Página donde la escena se recorre en 3D. */
  href: string;
  fromVideo: boolean;
  source: { name: string; url: string; license: string };
  /** Imagen fija y rótulo de cada lado de la comparación (las genera scripts/landing-stills.mjs). */
  points: { still: string; detail: string };
  splats: { still: string; detail: string };
  stats: { label: string; value: string }[];
};

type Summary = {
  photos: { count: number; minutes: number | null };
  video?: { keyframes: number; registered: number; segment: { start: number; end: number } };
  points: { count: number };
  splats: { count: number };
};

const SUMMARIES: Record<string, Summary> = { abadia, house1, house3, kallang, pipes1 };

// scene.json no guarda con qué ni cuántos pasos se entrenó el modelo publicado. El de Kallang es la v3: gsplat con
// Difix3D+ de NVIDIA, 60.000 pasos (worker/kaggle/difix3d.ipynb); los demás, Brush.
const TRAINING_STEPS: Record<string, number> = { kallang: 60000 };
const TRAINER: Record<string, string> = { kallang: "gsplat + Difix3D+" };

// Orden en la portada: primero las escenas hechas a partir de video, donde DronAI calcula también las posiciones
// de la cámara, y después las de fotos. Una escena que no esté en esta lista va al final.
const ORDER = ["kallang", "abadia", "pipes1", "house1", "house3"];
const position = (id: string) => (ORDER.includes(id) ? ORDER.indexOf(id) : ORDER.length);

const count = (n: number) => n.toLocaleString("es");

function landingScene(dataset: Dataset, scene: Summary): LandingScene {
  const steps = TRAINING_STEPS[dataset.id];
  const folder = dataset.sceneUrl.replace(/scene\.json$/, "");
  const capture = scene.video
    ? [
        { label: "Toma de video", value: `${Math.round(scene.video.segment.end - scene.video.segment.start)} s` },
        scene.video.registered === scene.video.keyframes
          ? { label: "Cuadros clave, todos ubicados por COLMAP", value: count(scene.video.keyframes) }
          : {
              label: "Cuadros clave ubicados por COLMAP",
              value: `${count(scene.video.registered)} de ${count(scene.video.keyframes)}`,
            },
      ]
    : [
        ...(scene.photos.minutes
          ? [{ label: "Vuelo del dron", value: `${scene.photos.minutes.toLocaleString("es")} min` }]
          : []),
        { label: "Fotos", value: count(scene.photos.count) },
      ];

  return {
    id: dataset.id,
    title: dataset.title,
    place: dataset.place,
    sceneUrl: dataset.sceneUrl,
    href: `/escenas/${dataset.id}`,
    fromVideo: Boolean(dataset.fromVideo),
    source: dataset.source,
    // En las escenas de video la nube la calcula DronAI con COLMAP; en las del dataset viene de DroneDeploy.
    points: {
      still: `${folder}landing-puntos.webp`,
      detail: `${dataset.fromVideo ? "COLMAP" : "DroneDeploy"} · ${count(scene.points.count)} puntos`,
    },
    splats: {
      still: `${folder}landing-splats.webp`,
      detail: `${TRAINER[dataset.id] ?? "Brush"} · ${steps ? `${count(steps)} pasos · ` : ""}${count(scene.splats.count)} splats`,
    },
    stats: [
      ...capture,
      { label: "Puntos en la nube", value: count(scene.points.count) },
      { label: "Gaussian splats", value: count(scene.splats.count) },
    ],
  };
}

export const LANDING_SCENES: LandingScene[] = DATASETS.filter((dataset) => dataset.id in SUMMARIES)
  .sort((a, b) => position(a.id) - position(b.id))
  .map((dataset) => landingScene(dataset, SUMMARIES[dataset.id]));
