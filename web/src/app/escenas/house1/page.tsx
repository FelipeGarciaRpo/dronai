import type { Metadata } from "next";
import Link from "next/link";
import { CANVAS_BACKGROUND, textLink } from "@/components/site/styles";
import { RealSceneViewer } from "@/components/viewer/scene-viewer";
import { ViewerHint, ViewerPanel } from "@/components/viewer/viewer-panel";

export const metadata: Metadata = {
  title: "Casa real reconstruida · DronAI",
  description: "Una casa reconstruida con Gaussian splats a partir de 220 fotos reales de dron.",
};

export default function House1Page() {
  return (
    <main className="relative h-dvh w-full overflow-hidden" style={{ background: CANVAS_BACKGROUND }}>
      <RealSceneViewer sceneUrl="/scenes/house1/scene.json" />
      <ViewerPanel title="Casa real reconstruida">
        <p>Esta casa se reconstruyó a partir de 220 fotos reales tomadas por un dron DJI Phantom 4.</p>
        <p>
          Lo que ves son Gaussian splats: unas 328 mil manchas de color que DronAI ajustó durante 12 minutos, en una
          laptop con RTX 3050, hasta que la escena se viera como las fotos desde cada ángulo. Lo que el dron vio
          poco, en los bordes, queda borroso.
        </p>
        <p>
          Aquí las posiciones de las cámaras son las que trae el dataset. En las escenas que salen de un video, como la
          torre de Kallang, DronAI las calcula por su cuenta con COLMAP.
        </p>
        <p>
          Con los botones de abajo puedes compararlos con la nube de puntos que calculó DroneDeploy y ver desde dónde se
          tomó cada foto.
        </p>
        <p>
          <Link href="/reconstruir" className={`font-medium text-ink ${textLink}`}>
            Ver la reconstrucción paso a paso
          </Link>{" "}
          →
        </p>
        <p className="text-xs text-ink-faint">
          Datos:{" "}
          <a href="https://github.com/nickponline/dd-nerf-dataset" className={`text-ink-soft ${textLink}`}>
            DroneDeploy NeRF Dataset
          </a>{" "}
          · CC BY-NC-SA 4.0
        </p>
        <ViewerHint camera="orbit" />
      </ViewerPanel>
    </main>
  );
}
