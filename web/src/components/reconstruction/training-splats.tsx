"use client";

import { extend, useFrame, useThree } from "@react-three/fiber";
import { SparkRenderer as SparkRendererImpl, SplatMesh as SplatMeshImpl } from "@sparkjsdev/spark";
import { type RefObject, useMemo, useRef } from "react";
import type { Frame } from "../viewer/scene-data";
import { type Clock, SPLATS, progressOf, smoothstep } from "./timeline";

const SparkRenderer = extend(SparkRendererImpl);
const SplatMesh = extend(SplatMeshImpl);

// Un giro de -90° en X lleva (este, norte, arriba) a los ejes del visor: (este, arriba, sur).
const ENU_TO_VIEWER: [number, number, number] = [-Math.PI / 2, 0, 0];
const NO_ROTATION: [number, number, number] = [0, 0, 0];

type Props = { snapshots: { step: number; url: string }[]; frame: Frame; clockRef: RefObject<Clock> };

// Muestra en secuencia las capturas del entrenamiento (de manchas borrosas a la escena nítida), con un
// fundido entre una y la siguiente. La última queda visible al terminar.
export function TrainingSplats({ snapshots, frame, clockRef }: Props) {
  const gl = useThree((state) => state.gl);
  const meshes = useRef<(SplatMeshImpl | null)[]>([]);
  const loadedRef = useRef(0);

  const sparkOptions = useMemo(() => ({ renderer: gl }), [gl]);
  const meshOptions = useMemo(
    () =>
      snapshots.map((snapshot) => ({
        url: snapshot.url,
        onLoad: () => {
          loadedRef.current += 1;
          if (loadedRef.current === snapshots.length) clockRef.current.splatsReady = true;
        },
      })),
    [snapshots, clockRef],
  );

  useFrame(() => {
    const p = progressOf(SPLATS, clockRef.current.time);
    const n = snapshots.length;
    // Cada captura ocupa un tramo; la última se queda medio tramo más antes de terminar.
    const x = p * (n - 0.5);
    const i = Math.min(n - 1, Math.floor(x));
    const blend = i < n - 1 ? smoothstep(0.55, 1, x - i) : 0;
    const appear = smoothstep(0, 0.12, p);

    meshes.current.forEach((mesh, k) => {
      if (!mesh) return;
      const opacity = p <= 0 ? 0 : appear * (k === i ? 1 - blend : k === i + 1 ? blend : 0);
      mesh.opacity = opacity;
      mesh.visible = opacity > 0.001;
    });
    clockRef.current.step = p > 0 ? snapshots[blend > 0.5 ? i + 1 : i].step : 0;
  });

  return (
    <>
      <SparkRenderer args={[sparkOptions]} />
      {meshOptions.map((options, k) => (
        <SplatMesh
          key={options.url}
          ref={(mesh: SplatMeshImpl | null) => {
            meshes.current[k] = mesh;
          }}
          args={[options]}
          rotation={frame === "enu" ? ENU_TO_VIEWER : NO_ROTATION}
        />
      ))}
    </>
  );
}
