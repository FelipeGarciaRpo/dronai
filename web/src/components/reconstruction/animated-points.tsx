"use client";

import { useFrame } from "@react-three/fiber";
import { type RefObject, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { CameraShot } from "../viewer/camera-frustums";
import { usePointCloudGeometry } from "../viewer/point-cloud";
import { type Clock, POINTS, SPLATS, STAGES, locate, progressOf, smoothstep } from "./timeline";

// Cuánto tarda cada punto en volar desde su foto hasta su lugar.
const FLIGHT_SECONDS = 0.9;

const vertexShader = /* glsl */ `
  attribute float view;
  // Fila 0: posición de cada cámara (xyz) y cuándo empieza su turno (w). Fila 1: cuánto dura el turno.
  uniform sampler2D uCameras;
  uniform float uLocal;   // avance de la etapa, de 0 a 1
  uniform float uFlight;  // duración del vuelo de un punto, en la misma escala
  uniform float uSize;    // tamaño del punto, en metros
  uniform float uScale;   // mitad del alto del lienzo, en píxeles
  varying vec3 vColor;
  varying float vShow;

  float hash(uint x) {
    x ^= x >> 16u; x *= 0x7feb352du; x ^= x >> 15u; x *= 0x846ca68bu; x ^= x >> 16u;
    return float(x) / 4294967295.0;
  }

  void main() {
    int k = int(view + 0.5);
    vec4 cam = texelFetch(uCameras, ivec2(k, 0), 0);
    float turn = texelFetch(uCameras, ivec2(k, 1), 0).x;
    float start = cam.w + hash(uint(gl_VertexID)) * turn;
    float t = clamp((uLocal - start) / uFlight, 0.0, 1.0);
    vShow = step(start, uLocal);
    float eased = 1.0 - pow(1.0 - t, 3.0);
    vec3 pos = mix(cam.xyz, position, eased);
    // Mientras vuela, el punto brilla en blanco; al llegar toma el color real del terreno.
    vColor = mix(vec3(1.0), color, smoothstep(0.5, 1.0, t));
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = vShow * uSize * uScale / -mv.z * (1.0 + 1.5 * (1.0 - eased));
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uOpacity;
  varying vec3 vColor;
  varying float vShow;

  void main() {
    if (vShow < 0.5) discard;
    gl_FragColor = vec4(vColor, uOpacity);
    #include <colorspace_fragment>
  }
`;

type Props = { url: string; shots: CameraShot[]; size: number; clockRef: RefObject<Clock> };

// La nube de puntos se arma foto a foto: cada foto tiene un turno (más largo si aporta más puntos) y
// durante su turno sus puntos salen de la cámara y vuelan hasta su posición.
export function AnimatedPoints({ url, shots, size, clockRef }: Props) {
  const geometry = usePointCloudGeometry(url);
  const material = useRef<THREE.ShaderMaterial>(null);
  const points = useRef<THREE.Points>(null);

  const turns = useMemo(() => {
    const views = geometry.getAttribute("view") as THREE.BufferAttribute | undefined;
    const counts = new Float64Array(shots.length);
    if (views) for (let i = 0; i < views.count; i++) counts[Math.round(views.getX(i))] += 1;
    const mean = counts.reduce((sum, c) => sum + c, 0) / shots.length || 1;
    const weights = Array.from(counts, (c) => 0.2 + c / mean);
    const total = weights.reduce((sum, w) => sum + w, 0);
    // Los turnos ocupan la etapa menos el último vuelo, para que todo haya aterrizado al terminar.
    const available = 1 - FLIGHT_SECONDS / STAGES[POINTS].seconds;
    const starts = weights.map((_, k) => (available * weights.slice(0, k).reduce((sum, w) => sum + w, 0)) / total);
    return weights.map((w, k) => ({ start: starts[k], length: (available * w) / total }));
  }, [geometry, shots.length]);

  const cameras = useMemo(() => {
    const data = new Float32Array(shots.length * 2 * 4);
    shots.forEach((shot, k) => {
      data.set([shot.position.x, shot.position.y, shot.position.z, turns[k].start], k * 4);
      data[(shots.length + k) * 4] = turns[k].length;
    });
    const texture = new THREE.DataTexture(data, shots.length, 2, THREE.RGBAFormat, THREE.FloatType);
    texture.needsUpdate = true;
    return texture;
  }, [shots, turns]);
  useEffect(() => () => cameras.dispose(), [cameras]);

  const uniforms = useMemo(
    () => ({
      uCameras: { value: cameras },
      uLocal: { value: -1 },
      uFlight: { value: FLIGHT_SECONDS / STAGES[POINTS].seconds },
      uSize: { value: size },
      uScale: { value: 1 },
      uOpacity: { value: 1 },
    }),
    [cameras, size],
  );

  useFrame((state) => {
    if (!material.current || !points.current) return;
    const { time } = clockRef.current;
    const { stage, local } = locate(time);
    const u = material.current.uniforms;
    u.uScale.value = (state.size.height * state.viewport.dpr) / 2;
    u.uLocal.value = stage < POINTS ? -1 : stage === POINTS ? local : 2;
    // Al llegar los splats, la nube se desvanece en el primer segundo y medio. Mientras se desvanece no
    // escribe profundidad y después se oculta: si no, sus puntos invisibles agujerearían los splats.
    const opacity = 1 - smoothstep(0, 1.5 / STAGES[SPLATS].seconds, progressOf(SPLATS, time));
    u.uOpacity.value = opacity;
    material.current.depthWrite = opacity >= 1;
    points.current.visible = stage >= POINTS && opacity > 0.01;
    clockRef.current.emitter = stage === POINTS ? turns.findIndex((t) => local < t.start + t.length) : -1;
  });

  return (
    <points ref={points} geometry={geometry} frustumCulled={false} visible={false}>
      <shaderMaterial
        ref={material}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        vertexColors
        transparent
      />
    </points>
  );
}
