import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DATASETS } from "@/components/reconstruction/datasets";
import { CANVAS_BACKGROUND, textLink } from "@/components/site/styles";
import { RealSceneViewer } from "@/components/viewer/scene-viewer";
import { ViewerHint, ViewerPanel } from "@/components/viewer/viewer-panel";

// Visor completo de las escenas de la galería. house1 tiene su propia página, con su historia.
type Props = { params: Promise<{ id: string }> };

export function generateStaticParams() {
  return DATASETS.filter((d) => d.id !== "house1").map((d) => ({ id: d.id }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const dataset = DATASETS.find((d) => d.id === id);
  if (!dataset) return {};
  return {
    title: `${dataset.title} · DronAI`,
    description: `${dataset.description} Reconstruida con Gaussian splats.`,
  };
}

export default async function ScenePage({ params }: Props) {
  const { id } = await params;
  const dataset = DATASETS.find((d) => d.id === id);
  if (!dataset) notFound();
  return (
    <main className="relative h-dvh w-full overflow-hidden" style={{ background: CANVAS_BACKGROUND }}>
      <RealSceneViewer sceneUrl={dataset.sceneUrl} />
      <ViewerPanel title={dataset.title} place={dataset.place}>
        <p>{dataset.description}</p>
        <p>
          Lo que ves son Gaussian splats entrenados por DronAI con{" "}
          {dataset.trainedWith ?? "Brush, en una laptop con RTX 3050"}.{" "}
          {dataset.fromVideo
            ? "Como un video no trae GPS, la escena no tiene escala real."
            : "Las posiciones de las cámaras son las que trae el dataset."}{" "}
          Lo que se vio poco queda borroso.
        </p>
        <p>
          <Link href="/reconstruir" className={`font-medium text-ink ${textLink}`}>
            Ver la reconstrucción paso a paso
          </Link>{" "}
          →
        </p>
        <p className="text-xs text-ink-faint">
          {dataset.fromVideo ? "Video" : "Datos"}:{" "}
          <a href={dataset.source.url} className={`text-ink-soft ${textLink}`}>
            {dataset.source.name}
          </a>{" "}
          · {dataset.source.license}
        </p>
        <ViewerHint camera={dataset.fromVideo ? "drone" : "orbit"} />
      </ViewerPanel>
    </main>
  );
}
