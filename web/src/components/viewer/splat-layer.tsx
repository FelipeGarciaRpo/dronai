"use client";

import { extend, useThree } from "@react-three/fiber";
import { SparkRenderer as SparkRendererImpl, SplatMesh as SplatMeshImpl } from "@sparkjsdev/spark";
import { useMemo } from "react";

const SparkRenderer = extend(SparkRendererImpl);
const SplatMesh = extend(SplatMeshImpl);

// Un giro de -90° en X lleva (este, norte, arriba) a los ejes del visor: (este, arriba, sur).
const ENU_TO_VIEWER: [number, number, number] = [-Math.PI / 2, 0, 0];
const NO_ROTATION: [number, number, number] = [0, 0, 0];

type Props = {
  url: string;
  /** "enu": el archivo está en metros este-norte-arriba; "viewer": ya está en los ejes del visor. */
  frame: "enu" | "viewer";
  visible: boolean;
  /** Avance de la descarga, de 0 a 1. Debe ser una función estable (por ejemplo, un setState). */
  onProgress: (fraction: number) => void;
};

export function SplatLayer({ url, frame, visible, onProgress }: Props) {
  const gl = useThree((state) => state.gl);
  const invalidate = useThree((state) => state.invalidate);

  // Con frameloop="demand" hay que pedir un frame cuando Spark reordena las gaussianas (onDirty) y
  // cuando termina de cargarlas. Las opciones van memoizadas: si cambian, R3F recrea el objeto.
  const sparkOptions = useMemo(() => ({ renderer: gl, onDirty: () => invalidate() }), [gl, invalidate]);
  const meshOptions = useMemo(
    () => ({
      url,
      onProgress: (event: ProgressEvent) => {
        if (event.total > 0) onProgress(Math.min(event.loaded / event.total, 0.99));
      },
      onLoad: () => {
        onProgress(1);
        invalidate();
      },
    }),
    [url, invalidate, onProgress],
  );

  return (
    <>
      <SparkRenderer args={[sparkOptions]} />
      <SplatMesh args={[meshOptions]} rotation={frame === "enu" ? ENU_TO_VIEWER : NO_ROTATION} visible={visible} />
    </>
  );
}
