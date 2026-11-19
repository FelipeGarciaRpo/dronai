import type { Metadata } from "next";
import { ReconstructionApp } from "@/components/reconstruction/reconstruction-app";

export const metadata: Metadata = {
  title: "Reconstruir paso a paso · DronAI",
  description: "Elige fotos de dron y mira cómo DronAI las convierte, paso a paso, en un mundo 3D.",
};

export default function ReconstruirPage() {
  return (
    <main className="min-h-dvh bg-paper text-ink-soft">
      <ReconstructionApp />
    </main>
  );
}
