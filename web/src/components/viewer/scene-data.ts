import * as THREE from "three";
import type { CameraShot } from "./camera-frustums";

type Vec3 = [number, number, number];
// "enu": metros este-norte-arriba (hay que girarlo a los ejes del visor); "viewer": ya en ejes del visor.
export type Frame = "enu" | "viewer";

// Formato de scene.json, el archivo que genera el worker (`dronai-worker dnf-import`).
export type SceneData = {
  id: string;
  title: string;
  source: { name: string; url: string; license: string };
  method: string;
  sensor: string;
  // false si la escena no está en metros (poses de un video, sin GPS): las distancias son relativas.
  metric?: boolean;
  photos?: {
    count: number;
    width: number;
    height: number;
    start: string | null;
    minutes: number | null;
    altitude: number | null;
  };
  // Escenas hechas a partir de un video (`dronai-worker keyframes` + COLMAP + `dronai-worker colmap-import`).
  video?: {
    name: string;
    keyframes: number;
    registered: number;
    segment: { index: number; count: number; start: number; end: number };
  };
  // Si views es true, cada punto trae la propiedad "view": la foto que lo ve más de cerca.
  points: { url: string; count: number; total: number; size: number; views?: boolean };
  // Gaussian splats entrenados por DronAI (`dronai-worker splats-export`), si ya existen.
  splats?: { url: string; count: number; total: number; frame: Frame; method: string };
  // Capturas intermedias del entrenamiento (`dronai-worker splats-training`).
  training?: { totalSteps: number; frame: Frame; snapshots: { step: number; url: string; count: number }[] };
  cameras: {
    fovY: number;
    aspect: number;
    frustumDepth: number;
    orderedByTime: boolean;
    items: { p: Vec3; f: Vec3; u: Vec3; img?: string }[];
  };
  view: { target: Vec3; position: Vec3 };
};

const cache = new Map<string, Promise<SceneData | null>>();

// Devuelve null si la escena todavía no se generó (404), para mostrar cómo crearla.
export function loadScene(url: string) {
  let promise = cache.get(url);
  if (!promise) {
    promise = fetch(url).then((res) => (res.ok ? (res.json() as Promise<SceneData>) : null));
    cache.set(url, promise);
  }
  return promise;
}

// Las rutas dentro de scene.json son relativas al propio archivo. Solo se usa en el navegador.
export function resolveAsset(sceneUrl: string, path: string) {
  const url = new URL(path, new URL(sceneUrl, window.location.href));
  return url.origin === window.location.origin ? url.pathname : url.toString();
}

export function toShots(scene: SceneData): CameraShot[] {
  return scene.cameras.items.map(({ p, f, u }) => ({
    position: new THREE.Vector3(...p),
    forward: new THREE.Vector3(...f),
    up: new THREE.Vector3(...u),
  }));
}
