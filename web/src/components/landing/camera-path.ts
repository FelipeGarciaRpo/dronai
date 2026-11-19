import * as THREE from "three";
import type { SceneData } from "@/components/viewer/scene-data";

// Recorrido de la cámara en la comparación de la portada.
// - Escenas de video: repite el recorrido del dron, que es desde donde la escena se ve mejor.
// - Escenas de fotos: da una vuelta alrededor del centro. El vuelo de mapeo va en zigzag, con saltos y giros
//   bruscos entre una foto y la siguiente, así que repetirlo marea.

// La torre de Kallang da la vuelta completa en 100 s; las demás escenas giran a esa misma velocidad.
const DEGREES_PER_SECOND = 3.6;
const MIN_SECONDS = 40;

// Órbita de las escenas de fotos, relativa a cómo voló el dron: a la distancia de la foto típica y algo más baja,
// para que se vean las fachadas y no solo los techos. Más lejos o más abajo aparece lo que el dron vio poco, que
// queda borroso.
const ORBIT_DISTANCE = 1;
const ORBIT_LOWER = THREE.MathUtils.degToRad(8);
const ORBIT_MIN_ELEVATION = THREE.MathUtils.degToRad(28);
const ORBIT_MAX_ELEVATION = THREE.MathUtils.degToRad(54);
const ORBIT_FOV = 40;

export type CameraPath = {
  fov: number;
  /** Segundos que tarda una pasada completa. */
  seconds: number;
  /** El recorrido no cierra sobre sí mismo: la cámara va y vuelve. */
  pingPong: boolean;
  /** Ubica la cámara en la fracción `phase` del recorrido, de 0 a 1. */
  place: (phase: number, camera: THREE.Camera) => void;
};

export function cameraPath(scene: SceneData): CameraPath {
  return scene.video ? dronePath(scene) : orbitPath(scene);
}

/** Avance del recorrido (en pasadas) → fracción del recorrido. Si va y vuelve, frena en los extremos. */
export function phaseAt(turns: number, pingPong: boolean) {
  if (!pingPong) return ((turns % 1) + 1) % 1;
  const triangle = 1 - Math.abs((((turns % 2) + 2) % 2) - 1);
  return (1 - Math.cos(Math.PI * triangle)) / 2;
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[sorted.length >> 1];
}

function dronePath(scene: SceneData): CameraPath {
  const center = new THREE.Vector3(...scene.view.target);
  const positions = scene.cameras.items.map(({ p }) => new THREE.Vector3(...p));
  // Cada cuadro mira hacia el centro de la escena, que queda más o menos a esta distancia.
  const reach = median(positions.map((p) => p.distanceTo(center)));
  const targets = scene.cameras.items.map(({ p, f }) =>
    new THREE.Vector3(...p).addScaledVector(new THREE.Vector3(...f), reach),
  );
  const steps = positions.slice(1).map((p, i) => p.distanceTo(positions[i]));
  const closed = positions[0].distanceTo(positions[positions.length - 1]) < 4 * median(steps);

  // Ángulo que el dron gira alrededor del centro, para que todas las escenas se muevan a la misma velocidad.
  let swept = 0;
  for (let i = 1; i < positions.length; i++) {
    const a = Math.atan2(positions[i - 1].x - center.x, positions[i - 1].z - center.z);
    const b = Math.atan2(positions[i].x - center.x, positions[i].z - center.z);
    swept += Math.atan2(Math.sin(b - a), Math.cos(b - a));
  }

  const position = new THREE.CatmullRomCurve3(positions, closed, "centripetal");
  const target = new THREE.CatmullRomCurve3(targets, closed, "centripetal");
  position.arcLengthDivisions = 2000; // velocidad pareja aunque los cuadros clave no estén equiespaciados
  const lookAt = new THREE.Vector3();

  return {
    fov: scene.cameras.fovY,
    seconds: Math.max(MIN_SECONDS, Math.abs(THREE.MathUtils.radToDeg(swept)) / DEGREES_PER_SECOND),
    pingPong: !closed,
    place(phase, camera) {
      // Fracción del largo del recorrido → parámetro de la curva (con distancia 0, three usa la fracción).
      const t = position.getUtoTmapping(phase, 0);
      position.getPoint(t, camera.position);
      camera.lookAt(target.getPoint(t, lookAt));
    },
  };
}

function orbitPath(scene: SceneData): CameraPath {
  const center = new THREE.Vector3(...scene.view.target);
  const cameras = scene.cameras.items;
  const distance = ORBIT_DISTANCE * median(cameras.map(({ p }) => new THREE.Vector3(...p).distanceTo(center)));
  // Cuánto miraban hacia abajo las fotos, medido desde el horizonte.
  const pitch = median(cameras.map(({ f }) => Math.asin(THREE.MathUtils.clamp(-f[1], -1, 1))));
  const elevation = THREE.MathUtils.clamp(pitch - ORBIT_LOWER, ORBIT_MIN_ELEVATION, ORBIT_MAX_ELEVATION);
  const radius = distance * Math.cos(elevation);
  const height = distance * Math.sin(elevation);
  // Arranca desde el mismo lado que la vista inicial del visor.
  const start = Math.atan2(scene.view.position[0] - center.x, scene.view.position[2] - center.z);

  return {
    fov: ORBIT_FOV,
    seconds: 360 / DEGREES_PER_SECOND,
    pingPong: false,
    place(phase, camera) {
      const angle = start + phase * Math.PI * 2;
      camera.position.set(center.x + radius * Math.sin(angle), center.y + height, center.z + radius * Math.cos(angle));
      camera.lookAt(center);
    },
  };
}
