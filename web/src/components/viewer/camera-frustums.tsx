"use client";

import { Line } from "@react-three/drei";
import { useMemo } from "react";
import * as THREE from "three";

export type CameraShot = {
  position: THREE.Vector3;
  forward: THREE.Vector3;
  up: THREE.Vector3;
};

type Props = {
  shots: CameraShot[];
  /** Distancia del vértice al marco de la foto, en metros. */
  depth: number;
  aspect: number;
  /** Campo de visión vertical, en grados. */
  fovY: number;
  /** Recorrido a dibujar; por defecto une las posiciones de las fotos en orden. */
  path?: THREE.Vector3[];
};

// Dibuja cada foto como una pirámide (la cámara en el vértice, mirando hacia el marco)
// y el recorrido del dron como una línea punteada.
export function CameraFrustums({ shots, depth, aspect, fovY, path }: Props) {
  const frustums = useMemo(() => {
    const halfH = Math.tan(THREE.MathUtils.degToRad(fovY) / 2) * depth;
    const halfW = halfH * aspect;
    const right = new THREE.Vector3();
    const segments: number[] = [];
    for (const { position: apex, forward, up } of shots) {
      right.crossVectors(forward, up).normalize();
      const corners = [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ].map(([sx, sy]) =>
        apex.clone().addScaledVector(forward, depth).addScaledVector(right, sx * halfW).addScaledVector(up, sy * halfH),
      );
      corners.forEach((corner, k) => {
        const next = corners[(k + 1) % 4];
        segments.push(apex.x, apex.y, apex.z, corner.x, corner.y, corner.z);
        segments.push(corner.x, corner.y, corner.z, next.x, next.y, next.z);
      });
    }
    return new Float32Array(segments);
  }, [shots, depth, aspect, fovY]);

  return (
    <group>
      <Line
        points={path ?? shots.map((shot) => shot.position)}
        color="#ededed"
        lineWidth={1.5}
        dashed
        dashSize={0.6}
        gapSize={0.4}
      />
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[frustums, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color="#f5f5f5" transparent opacity={0.7} />
      </lineSegments>
    </group>
  );
}
