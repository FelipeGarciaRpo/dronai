import type { Metadata } from "next";
import Link from "next/link";
import { CANVAS_BACKGROUND, textLink } from "@/components/site/styles";
import { SceneViewer } from "@/components/viewer/scene-viewer";
import { ViewerHint, ViewerPanel } from "@/components/viewer/viewer-panel";

export const metadata: Metadata = {
  title: "Visor 3D · DronAI",
  description: "Maqueta de prueba generada por código para probar el visor 3D de DronAI.",
};

export default function VisorPage() {
  return (
    <main className="relative h-dvh w-full overflow-hidden" style={{ background: CANVAS_BACKGROUND }}>
      <SceneViewer />
      <ViewerPanel title="Maqueta de prueba">
        <p>
          Este terreno está generado por código: no viene de ningún dron ni de ningún video. Sirve para probar el
          visor mientras construimos la reconstrucción real.
        </p>
        <p>
          La línea punteada muestra cómo volaría un dron alrededor de la casa para grabarla, y cada marco blanco,
          desde dónde tomaría una foto.
        </p>
        <p>
          <Link href="/escenas/house1" className={`font-medium text-ink ${textLink}`}>
            Ver una casa real reconstruida
          </Link>{" "}
          →
        </p>
        <ViewerHint />
      </ViewerPanel>
    </main>
  );
}
