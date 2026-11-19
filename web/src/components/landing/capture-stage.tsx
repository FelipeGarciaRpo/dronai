"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { COMPARE_BACKGROUND } from "./scene-compare";

const SceneCompare = dynamic(() => import("./scene-compare"), { ssr: false });

// Herramienta interna (ver scripts/landing-stills.mjs): dibuja una escena a pantalla completa, solo la nube de
// puntos (?lado=puntos) o solo los splats, con la cámara quieta en el arranque del recorrido (o en ?fase=0.25).
// Cuando todo cargó, marca <html data-captura="lista"> para que el script sepa que ya puede tomar la imagen.
export function CaptureStage({ sceneUrl }: { sceneUrl: string }) {
  const query = useSearchParams();
  const split = useRef(query.get("lado") === "puntos" ? 1 : 0);
  const [progress, setProgress] = useState(0);
  const [pointsLoaded, setPointsLoaded] = useState(false);
  const ready = progress >= 1 && pointsLoaded;

  useEffect(() => {
    if (!ready) return;
    // Un par de segundos de margen para que Spark termine de ordenar los splats.
    const timer = setTimeout(() => {
      document.documentElement.dataset.captura = "lista";
    }, 2000);
    return () => clearTimeout(timer);
  }, [ready]);

  const onProgress = useCallback((_sceneUrl: string, fraction: number) => setProgress(fraction), []);
  const onPointsLoaded = useCallback(() => setPointsLoaded(true), []);

  return (
    <div className="fixed inset-0" style={{ background: COMPARE_BACKGROUND }}>
      <SceneCompare
        sceneUrl={sceneUrl}
        split={split}
        moving={false}
        active
        startPhase={Number(query.get("fase") ?? 0)}
        onProgress={onProgress}
        onPointsLoaded={onPointsLoaded}
      />
    </div>
  );
}
