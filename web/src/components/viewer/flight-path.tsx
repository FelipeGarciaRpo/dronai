"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { CameraFrustums, type CameraShot } from "./camera-frustums";

// Órbita ilustrativa para la maqueta: así volaría un dron alrededor de la casa,
// con una foto cada 30 grados. No sale de ningún vuelo real.

const ORBIT_RADIUS = 16;
const ORBIT_HEIGHT = 11;
const TARGET = new THREE.Vector3(0, 2, 0);
const SHOTS = 12;

function orbitPoint(angle: number) {
  return new THREE.Vector3(Math.cos(angle) * ORBIT_RADIUS, ORBIT_HEIGHT, Math.sin(angle) * ORBIT_RADIUS);
}

export function FlightPath() {
  const { path, shots } = useMemo(() => {
    const path = Array.from({ length: 97 }, (_, i) => orbitPoint((i / 96) * Math.PI * 2));
    const shots = Array.from({ length: SHOTS }, (_, i): CameraShot => {
      const position = orbitPoint((i / SHOTS) * Math.PI * 2);
      const forward = TARGET.clone().sub(position).normalize();
      const right = new THREE.Vector3().crossVectors(forward, THREE.Object3D.DEFAULT_UP).normalize();
      return { position, forward, up: new THREE.Vector3().crossVectors(right, forward) };
    });
    return { path, shots };
  }, []);

  return <CameraFrustums shots={shots} path={path} depth={1.6} aspect={1.6} fovY={34.7} />;
}
