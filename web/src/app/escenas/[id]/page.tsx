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
    description: `${dataset.description} Reconstructed with Gaussian splats.`,
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
          What you see are Gaussian splats trained by DronAI with{" "}
          {dataset.trainedWith ?? "Brush on a laptop with an RTX 3050"}.{" "}
          {dataset.fromVideo
            ? "Since a video has no GPS, the scene has no real-world scale."
            : "The camera poses are the ones that come with the dataset."}{" "}
          Whatever was barely seen stays blurry.
        </p>
        <p>
          <Link href="/reconstruir" className={`font-medium text-ink ${textLink}`}>
            See the step-by-step reconstruction
          </Link>{" "}
          →
        </p>
        <p className="text-xs text-ink-faint">
          {dataset.fromVideo ? "Video" : "Data"}:{" "}
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
