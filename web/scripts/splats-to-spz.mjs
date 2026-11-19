// Convierte los splats de una escena (los PLY que exporta Brush) a SPZ, con armónicos esféricos de grado 3, y
// actualiza su scene.json. SPZ conserva el color que cambia con el ángulo de vista (el .splat no) y además pesa menos.
//
// Uso (desde web/):
//   node scripts/splats-to-spz.mjs <carpeta con los export_<paso>.ply> <carpeta de la escena web> \
//     [--steps 500,1000,2000,3500,5000,7000] [--final 7000] [--min-opacity 0.01] [--final-only]
//
// --final-only convierte solo el modelo final (splats.spz) y deja intacta la grabación del entrenamiento (training/),
// por ejemplo al cambiar el modelo por uno entrenado más tiempo en otra corrida.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { transcodeSpz } from "@sparkjsdev/spark";

const [snapshotsDir, sceneDir, ...rest] = process.argv.slice(2);
if (!snapshotsDir || !sceneDir) {
  console.error("Uso: node scripts/splats-to-spz.mjs <carpeta de PLY> <carpeta de la escena> [--steps ...] [--final N]");
  process.exit(1);
}
const option = (name, fallback) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : fallback;
};
const steps = option("steps", "500,1000,2000,3500,5000,7000").split(",").map(Number);
const finalStep = Number(option("final", String(Math.max(...steps))));
const minOpacity = Number(option("min-opacity", "0.01"));
const finalOnly = rest.includes("--final-only");

// Brush nombra las capturas export_<paso>.ply, a veces con ceros a la izquierda (export_0500.ply).
const available = new Map(
  fs
    .readdirSync(snapshotsDir)
    .map((name) => [name, /^export_(\d+)\.ply$/.exec(name)])
    .filter(([, match]) => match)
    .map(([name, match]) => [Number(match[1]), path.join(snapshotsDir, name)]),
);

function plyCount(bytes) {
  const header = Buffer.from(bytes.subarray(0, 4096)).toString("latin1");
  return Number(/element vertex (\d+)/.exec(header)?.[1] ?? 0);
}

async function convert(step, out) {
  const file = available.get(step);
  if (!file) throw new Error(`No hay captura para el paso ${step} en ${snapshotsDir}`);
  const bytes = new Uint8Array(fs.readFileSync(file));
  const { fileBytes } = await transcodeSpz({
    inputs: [{ fileBytes: bytes, fileType: "ply" }],
    maxSh: 3,
    opacityThreshold: minOpacity,
  });
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, fileBytes);
  // La cantidad de splats está en la cabecera de SPZ (después de descomprimir): magia, versión y cantidad.
  const count = zlib.gunzipSync(Buffer.from(fileBytes)).readUInt32LE(8);
  return { count, total: plyCount(bytes), mb: fileBytes.length / 1e6 };
}

const scenePath = path.join(sceneDir, "scene.json");
const scene = JSON.parse(fs.readFileSync(scenePath, "utf8"));

const final = await convert(finalStep, path.join(sceneDir, "splats.spz"));
scene.splats = {
  url: "splats.spz",
  count: final.count,
  total: final.total,
  frame: "enu",
  method: scene.splats?.method ?? "Gaussian splats entrenados por DronAI con Brush 0.3.0",
  sh: 3,
};
console.log(`Splats: ${final.count.toLocaleString("es")} de ${final.total.toLocaleString("es")} · splats.spz de ${final.mb.toFixed(1)} MB`);

if (!finalOnly) {
  const snapshots = [];
  for (const step of steps) {
    const name = `${String(step).padStart(5, "0")}.spz`;
    const result = await convert(step, path.join(sceneDir, "training", name));
    snapshots.push({ step, url: `training/${name}`, count: result.count });
    console.log(`Paso ${String(step).padStart(5)}: ${result.count.toLocaleString("es")} splats · ${result.mb.toFixed(1)} MB`);
  }
  scene.training = { totalSteps: scene.training?.totalSteps ?? finalStep, frame: "enu", snapshots };
}

fs.writeFileSync(scenePath, JSON.stringify(scene, null, 1));
console.log(`Escena actualizada: ${scenePath}`);
