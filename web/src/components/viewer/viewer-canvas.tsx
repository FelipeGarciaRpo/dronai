"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas, extend, useThree } from "@react-three/fiber";
import { SparkRenderer as SparkRendererImpl, SplatMesh as SplatMeshImpl } from "@sparkjsdev/spark";
import { useMemo } from "react";
import { buildDemoScene } from "./demo-terrain";
import { FlightPath } from "./flight-path";
import { CANVAS_BACKGROUND } from "../site/styles";

const SparkRenderer = extend(SparkRendererImpl);
const SplatMesh = extend(SplatMeshImpl);

function Splats() {
  const gl = useThree((state) => state.gl);
  const invalidate = useThree((state) => state.invalidate);

  // Con frameloop="demand" hay que pedir un frame cuando Spark termina de
  // ordenar las gaussianas (onDirty) o de construir la escena (onLoad).
  // Las opciones van memoizadas: si cambian, R3F recrea el objeto.
  const sparkOptions = useMemo(() => ({ renderer: gl, onDirty: () => invalidate() }), [gl, invalidate]);
  const meshOptions = useMemo(() => ({ constructSplats: buildDemoScene, onLoad: () => invalidate() }), [invalidate]);

  return (
    <>
      <SparkRenderer args={[sparkOptions]} />
      <SplatMesh args={[meshOptions]} />
    </>
  );
}

export default function ViewerCanvas() {
  return (
    <Canvas
      frameloop="demand"
      dpr={[1, 1.5]}
      gl={{ antialias: false }}
      camera={{ position: [24, 28, 30], fov: 50, near: 0.1, far: 500 }}
    >
      <color attach="background" args={[CANVAS_BACKGROUND]} />
      <Splats />
      <FlightPath />
      <OrbitControls
        makeDefault
        enableDamping
        target={[0, 1.5, 0]}
        maxPolarAngle={Math.PI * 0.47}
        minDistance={6}
        maxDistance={110}
      />
    </Canvas>
  );
}
