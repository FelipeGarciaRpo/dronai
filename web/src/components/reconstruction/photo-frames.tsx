"use client";

import { extend, useFrame, useLoader } from "@react-three/fiber";
import { type RefObject, useMemo, useRef } from "react";
import * as THREE from "three";
import type { CameraShot } from "../viewer/camera-frustums";
import { type Clock, PHOTOS, POINTS, SPLATS, locate, progressOf } from "./timeline";

// <line> choca con el elemento SVG del mismo nombre en JSX.
const PathLine = extend(THREE.Line);

type Props = {
  shots: CameraShot[];
  urls: string[];
  /** Campo de visión vertical de la cámara, en grados. */
  fovY: number;
  aspect: number;
  /** Distancia de la cámara a la foto flotante, en metros. */
  depth: number;
  clockRef: RefObject<Clock>;
};

function easeOutBack(t: number) {
  const c = 1.7;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
}

// Cada foto aparece flotando delante de la cámara que la tomó, en orden de captura, junto con el
// recorrido del dron. Mientras se arma la nube, la foto que aporta sus puntos se agranda.
export function PhotoFrames({ shots, urls, fovY, aspect, depth, clockRef }: Props) {
  const textures = useLoader(THREE.TextureLoader, urls);

  const frames = useMemo(() => {
    const halfH = Math.tan(THREE.MathUtils.degToRad(fovY) / 2) * depth;
    return shots.map((shot) => {
      const right = new THREE.Vector3().crossVectors(shot.forward, shot.up).normalize();
      const up = new THREE.Vector3().crossVectors(right, shot.forward).normalize();
      const back = shot.forward.clone().negate();
      const quaternion = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, back));
      const position = shot.position.clone().addScaledVector(shot.forward, depth);
      return { position, quaternion, width: halfH * aspect * 2, height: halfH * 2 };
    });
  }, [shots, fovY, aspect, depth]);

  const plane = useMemo(() => new THREE.PlaneGeometry(1, 1), []);
  const pathGeometry = useMemo(
    () => new THREE.BufferGeometry().setFromPoints(shots.map((shot) => shot.position)),
    [shots],
  );
  const meshes = useRef<(THREE.Mesh | null)[]>([]);
  const materials = useRef<(THREE.MeshBasicMaterial | null)[]>([]);
  const path = useRef<THREE.Line>(null);
  const pathMaterial = useRef<THREE.LineBasicMaterial>(null);

  useFrame(() => {
    const { time, emitter } = clockRef.current;
    const shown = progressOf(PHOTOS, time) * frames.length;
    const stage = locate(time).stage;
    // Al empezar los splats, las fotos y el recorrido se desvanecen en un par de segundos.
    const fade = 1 - Math.min(1, progressOf(SPLATS, time) * 5);

    frames.forEach((frame, k) => {
      const mesh = meshes.current[k];
      const material = materials.current[k];
      if (!mesh || !material) return;
      const grow = THREE.MathUtils.clamp((shown - k) / 4, 0, 1);
      // Mientras se arma la nube, la foto que aporta sus puntos resalta y las demás se achican y se
      // aclaran para no tapar el terreno.
      const building = stage === POINTS;
      const active = building && emitter === k;
      const scale = easeOutBack(grow) * (active ? 1.4 : building ? 0.8 : 1);
      mesh.visible = grow > 0 && fade > 0;
      mesh.scale.set(frame.width * scale, frame.height * scale, 1);
      material.opacity = fade * (building && !active ? 0.3 : 1);
    });

    if (path.current && pathMaterial.current) {
      path.current.geometry.setDrawRange(0, Math.ceil(shown));
      path.current.visible = fade > 0;
      pathMaterial.current.opacity = 0.8 * fade;
    }
  });

  return (
    <group>
      <PathLine ref={path} geometry={pathGeometry}>
        <lineBasicMaterial ref={pathMaterial} color="#ededed" transparent opacity={0.8} />
      </PathLine>
      {frames.map((frame, k) => (
        <mesh
          key={k}
          ref={(mesh) => {
            meshes.current[k] = mesh;
          }}
          geometry={plane}
          position={frame.position}
          quaternion={frame.quaternion}
          visible={false}
        >
          {/* Al pasar la textura por JSX, R3F la marca como sRGB para que los colores salgan bien. */}
          <meshBasicMaterial
            ref={(material) => {
              materials.current[k] = material;
            }}
            map={textures[k]}
            side={THREE.DoubleSide}
            transparent
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}
