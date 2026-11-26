import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CaptureStage } from "@/components/landing/capture-stage";
import { DATASETS } from "@/components/reconstruction/datasets";

// Herramienta interna para generar las imágenes fijas de la portada (scripts/landing-stills.mjs). Solo existe en
// desarrollo: en producción responde 404.
type Props = { params: Promise<{ id: string }> };

export const metadata: Metadata = { title: "Capture · DronAI", robots: { index: false } };

export function generateStaticParams() {
  return DATASETS.map((d) => ({ id: d.id }));
}

export default async function CapturePage({ params }: Props) {
  if (process.env.NODE_ENV === "production") notFound();
  const { id } = await params;
  const dataset = DATASETS.find((d) => d.id === id);
  if (!dataset) notFound();
  return (
    <Suspense fallback={null}>
      <CaptureStage sceneUrl={dataset.sceneUrl} />
    </Suspense>
  );
}
