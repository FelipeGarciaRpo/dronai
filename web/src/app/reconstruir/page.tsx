import type { Metadata } from "next";
import { ReconstructionApp } from "@/components/reconstruction/reconstruction-app";

export const metadata: Metadata = {
  title: "Step-by-step reconstruction · DronAI",
  description: "Pick a set of drone photos and watch DronAI turn them, step by step, into a 3D world.",
};

export default function ReconstruirPage() {
  return (
    <main className="min-h-dvh bg-paper text-ink-soft">
      <ReconstructionApp />
    </main>
  );
}
