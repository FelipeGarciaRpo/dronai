import type { PackedSplats } from "@sparkjsdev/spark";
import * as THREE from "three";

// Escena de demostración generada por código (terreno, lago, bosque y una casa)
// para probar el visor mientras no tengamos reconstrucciones reales.

const SIZE = 64; // metros por lado
const STEP = 0.25; // separación entre gaussianas del suelo
const WATER_LEVEL = -0.6;
const HOUSE_BASE = 0.8;
const HOUSE = { width: 7, depth: 5, wall: 3, ridge: 1.8, step: 0.2 };

const UP = new THREE.Vector3(0, 1, 0);

const WATER = new THREE.Color("#2a6f97");
const SAND = new THREE.Color("#c8b27c");
const GRASS_A = new THREE.Color("#3f7a2e");
const GRASS_B = new THREE.Color("#6a9c3c");
const ROCK = new THREE.Color("#7a7268");
const SNOW = new THREE.Color("#eef1f4");
const TRUNK = new THREE.Color("#5b3a1e");
const LEAVES = new THREE.Color("#2f5d27");
const WALL = new THREE.Color("#e8e0d0");
const ROOF = new THREE.Color("#a4452c");
const DOOR = new THREE.Color("#4a2f1b");
const GLASS = new THREE.Color("#6f8fa6");

function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(x: number, y: number) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function valueNoise(x: number, y: number) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash(x0, y0);
  const b = hash(x0 + 1, y0);
  const c = hash(x0, y0 + 1);
  const d = hash(x0 + 1, y0 + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function fbm(x: number, y: number) {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < 5; i++) {
    sum += amp * valueNoise(x * freq, y * freq);
    freq *= 2;
    amp *= 0.5;
  }
  return sum;
}

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function terrainHeight(x: number, z: number) {
  const hills = (fbm(x * 0.045 + 10, z * 0.045 - 7) - 0.5) * 9 + 1.4;
  const ridge = Math.max(0, 1 - Math.hypot(x + 16, z - 14) / 15) ** 2 * 8;
  const lake = Math.max(0, 1 - Math.hypot(x - 13, z + 11) / 11) ** 1.5 * 4;
  const h = hills + ridge - lake;
  // explanada donde está la casa
  const flat = smoothstep(9, 5.5, Math.hypot(x, z));
  return h + (HOUSE_BASE - h) * flat;
}

// Rellena el paralelogramo origin + s*u + t*v con gaussianas planas orientadas
// según la normal u x v. colorAt devuelve null para dejar huecos.
function pushQuad(
  splats: PackedSplats,
  origin: THREE.Vector3,
  u: THREE.Vector3,
  v: THREE.Vector3,
  colorAt: (s: number, t: number) => THREE.Color | null,
) {
  const normal = new THREE.Vector3().crossVectors(u, v).normalize();
  const quat = new THREE.Quaternion().setFromUnitVectors(UP, normal);
  const scales = new THREE.Vector3(HOUSE.step * 0.6, 0.015, HOUSE.step * 0.6);
  const nu = Math.max(1, Math.round(u.length() / HOUSE.step));
  const nv = Math.max(1, Math.round(v.length() / HOUSE.step));
  const center = new THREE.Vector3();
  for (let i = 0; i <= nu; i++) {
    for (let j = 0; j <= nv; j++) {
      const color = colorAt(i / nu, j / nv);
      if (!color) continue;
      center.copy(origin).addScaledVector(u, i / nu).addScaledVector(v, j / nv);
      splats.pushSplat(center, scales, quat, 1, color);
    }
  }
}

function buildHouse(splats: PackedSplats, rand: () => number) {
  const { width: w, depth: d, wall: h, ridge: r } = HOUSE;
  const y0 = HOUSE_BASE;
  const tmp = new THREE.Color();
  const wall = () => tmp.copy(WALL).offsetHSL(0, 0, (rand() - 0.5) * 0.04);
  const inRange = (x: number, a: number, b: number) => x >= a && x <= b;

  // fachada con puerta y dos ventanas
  pushQuad(splats, new THREE.Vector3(-w / 2, y0, d / 2), new THREE.Vector3(w, 0, 0), new THREE.Vector3(0, h, 0), (s, t) => {
    if (inRange(s, 0.43, 0.57) && t < 0.68) return DOOR;
    if ((inRange(s, 0.12, 0.3) || inRange(s, 0.7, 0.88)) && inRange(t, 0.42, 0.75)) return GLASS;
    return wall();
  });
  pushQuad(splats, new THREE.Vector3(w / 2, y0, -d / 2), new THREE.Vector3(-w, 0, 0), new THREE.Vector3(0, h, 0), wall);
  pushQuad(splats, new THREE.Vector3(w / 2, y0, d / 2), new THREE.Vector3(0, 0, -d), new THREE.Vector3(0, h, 0), (s, t) =>
    inRange(s, 0.35, 0.65) && inRange(t, 0.42, 0.75) ? GLASS : wall(),
  );
  pushQuad(splats, new THREE.Vector3(-w / 2, y0, -d / 2), new THREE.Vector3(0, 0, d), new THREE.Vector3(0, h, 0), wall);

  // hastiales: triángulos entre el borde del muro y la cumbrera
  const gable = (s: number, t: number) => (t <= 1 - Math.abs(2 * s - 1) ? wall() : null);
  pushQuad(splats, new THREE.Vector3(w / 2, y0 + h, d / 2), new THREE.Vector3(0, 0, -d), new THREE.Vector3(0, r, 0), gable);
  pushQuad(splats, new THREE.Vector3(-w / 2, y0 + h, -d / 2), new THREE.Vector3(0, 0, d), new THREE.Vector3(0, r, 0), gable);

  // tejado a dos aguas con alero de 40 cm
  const eave = 0.4;
  const roof = (_s: number, t: number) =>
    tmp.copy(ROOF).offsetHSL(0, 0, Math.floor(t * 12) % 2 === 0 ? -0.03 : 0.02);
  pushQuad(
    splats,
    new THREE.Vector3(-w / 2 - eave, y0 + h - 0.25, d / 2 + eave),
    new THREE.Vector3(w + 2 * eave, 0, 0),
    new THREE.Vector3(0, r + 0.25, -(d / 2 + eave)),
    roof,
  );
  pushQuad(
    splats,
    new THREE.Vector3(w / 2 + eave, y0 + h - 0.25, -(d / 2 + eave)),
    new THREE.Vector3(-(w + 2 * eave), 0, 0),
    new THREE.Vector3(0, r + 0.25, d / 2 + eave),
    roof,
  );
}

function buildTrees(splats: PackedSplats, rand: () => number) {
  const center = new THREE.Vector3();
  const scales = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const color = new THREE.Color();
  let placed = 0;
  for (let i = 0; i < 6000 && placed < 450; i++) {
    const x = (rand() - 0.5) * (SIZE - 4);
    const z = (rand() - 0.5) * (SIZE - 4);
    if (Math.hypot(x, z) < 11) continue;
    const ground = terrainHeight(x, z);
    if (ground < WATER_LEVEL + 0.6 || ground > 5.5) continue;
    // bosques en manchas en vez de árboles repartidos al azar
    if (fbm(x * 0.08 + 40, z * 0.08 + 40) < 0.5) continue;
    placed++;

    const height = 2.2 + rand() * 2.2;
    center.set(x, ground + height * 0.3, z);
    scales.set(0.09, height * 0.18, 0.09);
    splats.pushSplat(center, scales, quat, 1, TRUNK);

    const crown = 0.9 + rand() * 0.6;
    for (let k = 0; k < 16; k++) {
      center.set(
        x + (rand() - 0.5) * crown * 1.2,
        ground + height * (0.65 + rand() * 0.35),
        z + (rand() - 0.5) * crown * 1.2,
      );
      const radius = crown * (0.18 + rand() * 0.14);
      scales.set(radius, radius * 0.9, radius);
      color.copy(LEAVES).offsetHSL((rand() - 0.5) * 0.03, 0, (rand() - 0.35) * 0.12);
      splats.pushSplat(center, scales, quat, 0.95, color);
    }
  }
}

function buildGround(splats: PackedSplats, rand: () => number) {
  const center = new THREE.Vector3();
  const scales = new THREE.Vector3(STEP * 0.55, STEP * 0.12, STEP * 0.55);
  const quat = new THREE.Quaternion();
  const normal = new THREE.Vector3();
  const color = new THREE.Color();
  const half = SIZE / 2;

  for (let x = -half; x <= half; x += STEP) {
    for (let z = -half; z <= half; z += STEP) {
      const px = x + (rand() - 0.5) * STEP * 0.6;
      const pz = z + (rand() - 0.5) * STEP * 0.6;
      const h = terrainHeight(px, pz);
      const dx = terrainHeight(px + 0.2, pz) - terrainHeight(px - 0.2, pz);
      const dz = terrainHeight(px, pz + 0.2) - terrainHeight(px, pz - 0.2);
      normal.set(-dx, 0.4, -dz).normalize();

      if (h < WATER_LEVEL) {
        color.copy(WATER).offsetHSL(0, 0, -Math.min((WATER_LEVEL - h) * 0.02, 0.06));
        normal.copy(UP);
      } else if (h < WATER_LEVEL + 0.35) {
        color.copy(SAND);
      } else if (h > 8) {
        color.copy(SNOW);
      } else if (h > 6 || normal.y < 0.75) {
        color.copy(ROCK);
      } else {
        color.copy(GRASS_A).lerp(GRASS_B, fbm(px * 0.3, pz * 0.3));
      }
      color.offsetHSL(0, 0, (rand() - 0.5) * 0.05);

      center.set(px, Math.max(h, WATER_LEVEL), pz);
      quat.setFromUnitVectors(UP, normal);
      splats.pushSplat(center, scales, quat, 0.95, color);
    }
  }
}

export function buildDemoScene(splats: PackedSplats) {
  const rand = mulberry32(7);
  buildGround(splats, rand);
  buildTrees(splats, rand);
  buildHouse(splats, rand);
}
