"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";

// Los visores usan WebGL, WASM y workers, así que solo se cargan en el navegador.
function Loading() {
  // El visor siempre tiene fondo oscuro, en los dos temas.
  return <div className="grid h-full place-items-center text-sm text-neutral-400">Loading the 3D viewer…</div>;
}

const ViewerCanvas = dynamic(() => import("./viewer-canvas"), { ssr: false, loading: Loading });
const RealSceneCanvas = dynamic(() => import("./real-scene-canvas"), { ssr: false, loading: Loading });

export function SceneViewer() {
  return <ViewerCanvas />;
}

// RealSceneCanvas suspende mientras descarga scene.json.
export function RealSceneViewer({ sceneUrl }: { sceneUrl: string }) {
  return (
    <Suspense fallback={<Loading />}>
      <RealSceneCanvas sceneUrl={sceneUrl} />
    </Suspense>
  );
}
