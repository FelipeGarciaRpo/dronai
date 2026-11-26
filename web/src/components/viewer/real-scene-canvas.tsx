"use client";

import { Canvas } from "@react-three/fiber";
import { Suspense, use, useMemo, useState } from "react";
import { cameraPath } from "../landing/camera-path";
import { CANVAS_BACKGROUND, floatingPanel } from "../site/styles";
import { CameraFrustums } from "./camera-frustums";
import { PathCamera } from "./path-camera";
import { PointCloud } from "./point-cloud";
import { loadScene, toShots } from "./scene-data";
import { SplatLayer } from "./splat-layer";

type Layer = "splats" | "points";

export default function RealSceneCanvas({ sceneUrl }: { sceneUrl: string }) {
  const scene = use(loadScene(sceneUrl));
  const shots = useMemo(() => (scene ? toShots(scene) : []), [scene]);
  // La cámara va por el mismo recorrido que en el carrusel de la portada (ver path-camera.tsx).
  const path = useMemo(() => (scene ? cameraPath(scene) : null), [scene]);
  const [layer, setLayer] = useState<Layer>(scene?.splats ? "splats" : "points");
  const [showCameras, setShowCameras] = useState(!scene?.splats);
  const [progress, setProgress] = useState(0);

  if (!scene) {
    return (
      <div className="grid h-full place-items-center px-6 text-center text-sm text-neutral-400">
        <p>
          This scene hasn&apos;t been generated on your machine yet. Follow the steps in{" "}
          <code>worker/README.md</code> (the <code>dronai-worker dnf-import</code> command).
        </p>
      </div>
    );
  }

  const base = new URL(sceneUrl, window.location.href);
  const pointsUrl = new URL(scene.points.url, base).toString();
  const splats = scene.splats ? { ...scene.splats, url: new URL(scene.splats.url, base).toString() } : null;
  const showSplats = splats !== null && layer === "splats";
  // En las escenas de video la nube la calcula DronAI con COLMAP; en las del dataset, viene de DroneDeploy.
  const layers: { id: Layer; label: string }[] = [
    { id: "splats", label: "DronAI splats" },
    { id: "points", label: scene.video ? "COLMAP point cloud" : "DroneDeploy point cloud" },
  ];

  return (
    <div className="relative h-full w-full">
      <Canvas
        frameloop="demand"
        dpr={[1, 1.5]}
        gl={{ antialias: false }}
        style={{ touchAction: "none" }}
        camera={{ fov: path?.fov ?? 50, near: 0.1, far: 1000 }}
      >
        <color attach="background" args={[CANVAS_BACKGROUND]} />
        {splats && <SplatLayer url={splats.url} frame={splats.frame} visible={showSplats} onProgress={setProgress} />}
        {!showSplats && (
          <Suspense fallback={null}>
            <PointCloud url={pointsUrl} size={scene.points.size * 1.5} />
          </Suspense>
        )}
        {showCameras && (
          <CameraFrustums
            shots={shots}
            depth={scene.cameras.frustumDepth}
            aspect={scene.cameras.aspect}
            fovY={scene.cameras.fovY}
          />
        )}
        {path && <PathCamera path={path} />}
      </Canvas>

      {splats && (
        <div className="absolute right-4 bottom-4 left-4 flex flex-col items-end gap-2 text-sm text-ink-soft sm:left-auto">
          {showSplats && progress < 1 && (
            <p className={`px-3 py-1.5 font-mono text-xs ${floatingPanel}`}>
              Loading {splats.count.toLocaleString("en-US")} splats
              {progress > 0 ? ` · ${Math.round(progress * 100)}%` : "…"}
            </p>
          )}
          <div className={`flex p-1 ${floatingPanel}`} role="group">
            {layers.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                aria-pressed={layer === id}
                onClick={() => setLayer(id)}
                className={`rounded-sm px-3 py-1.5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${
                  layer === id ? "bg-ink font-medium text-paper" : "text-ink-muted hover:text-ink"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <label className={`flex cursor-pointer items-center gap-2 px-3 py-1.5 ${floatingPanel}`}>
            <input
              type="checkbox"
              checked={showCameras}
              onChange={(e) => setShowCameras(e.target.checked)}
              className="accent-ink"
            />
            Drone photos
          </label>
        </div>
      )}
    </div>
  );
}
