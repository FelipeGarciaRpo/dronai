// Genera las imágenes fijas de la portada: por cada escena, la nube de puntos y los Gaussian splats vistos desde
// donde arranca la cámara de la comparación. La portada las usa en las comparaciones pequeñas, en celulares y
// mientras carga el 3D.
//
// Con `npm run dev` corriendo:
//   node scripts/landing-stills.mjs                    todas las escenas de public/scenes
//   node scripts/landing-stills.mjs --only=kallang     una sola
//   node scripts/landing-stills.mjs --base=http://localhost:3001
//   node scripts/landing-stills.mjs --lado=splats --fase=0.25 --sufijo=-prueba   para probar otros puntos del recorrido
//
// Abre /captura/<escena> en Chrome sin ventana (con GPU) por el protocolo de DevTools y guarda
// public/scenes/<escena>/landing-puntos.webp y landing-splats.webp. No necesita dependencias: usa el WebSocket de
// Node 22. Si Chrome no está en la ruta habitual, indícala con la variable CHROME_PATH.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const WIDTH = 1600;
const HEIGHT = 900;
const QUALITY = 86;
const TIMEOUT_MS = 180_000;

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")));
const base = args.base ?? "http://localhost:3000";
const scenesDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "scenes");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const chrome = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].find((path) => path && existsSync(path));
if (!chrome) throw new Error("No encontré Chrome. Indica su ruta con la variable CHROME_PATH.");

const scenes = readdirSync(scenesDir).filter((id) => {
  const file = join(scenesDir, id, "scene.json");
  return (!args.only || args.only === id) && existsSync(file) && JSON.parse(readFileSync(file, "utf8")).splats;
});
if (scenes.length === 0) throw new Error("No hay escenas con splats en public/scenes.");

// Chrome sin ventana, con un perfil temporal y la GPU activa (los splats necesitan WebGL2).
const profile = mkdtempSync(join(tmpdir(), "dronai-captura-"));
const browser = spawn(
  chrome,
  [
    "--headless=new",
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--hide-scrollbars",
    "--ignore-gpu-blocklist",
    `--window-size=${WIDTH},${HEIGHT}`,
    "about:blank",
  ],
  { stdio: ["ignore", "ignore", "pipe"] },
);
const endpoint = await new Promise((resolve, reject) => {
  let output = "";
  const timer = setTimeout(() => reject(new Error("Chrome no abrió el puerto de DevTools.")), 20_000);
  browser.stderr.on("data", (chunk) => {
    output += chunk;
    const match = output.match(/DevTools listening on (ws:\/\/\S+)/);
    if (!match) return;
    clearTimeout(timer);
    resolve(match[1]);
  });
});

const socket = new WebSocket(endpoint);
await new Promise((resolve, reject) => {
  socket.onopen = resolve;
  socket.onerror = reject;
});
let lastId = 0;
const pending = new Map();
socket.onmessage = (event) => {
  const message = JSON.parse(event.data);
  const waiting = pending.get(message.id);
  if (!waiting) return;
  pending.delete(message.id);
  if (message.error) waiting.reject(new Error(message.error.message));
  else waiting.resolve(message.result);
};
const send = (method, params = {}, sessionId) =>
  new Promise((resolve, reject) => {
    const id = ++lastId;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params, sessionId }));
  });

let failed = false;
try {
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  const page = (method, params) => send(method, params, sessionId);
  await page("Emulation.setDeviceMetricsOverride", { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false });

  for (const id of scenes) {
    for (const side of args.lado ? [args.lado] : ["puntos", "splats"]) {
      await page("Page.navigate", { url: `${base}/captura/${id}?lado=${side}${args.fase ? `&fase=${args.fase}` : ""}` });
      const start = Date.now();
      let ready = false;
      while (!ready && Date.now() - start < TIMEOUT_MS) {
        await sleep(500);
        const { result } = await page("Runtime.evaluate", {
          expression: 'document.documentElement.dataset.captura === "lista"',
        });
        ready = result.value === true;
      }
      if (!ready) throw new Error(`${id} (${side}) no terminó de cargar. ¿Está corriendo ${base}?`);
      // El indicador de desarrollo de Next no debe salir en la imagen.
      await page("Runtime.evaluate", {
        expression: 'document.querySelectorAll("nextjs-portal").forEach((el) => (el.style.display = "none"))',
      });
      const { data } = await page("Page.captureScreenshot", { format: "webp", quality: QUALITY });
      const file = join(scenesDir, id, `landing-${side}${args.sufijo ?? ""}.webp`);
      writeFileSync(file, Buffer.from(data, "base64"));
      console.log(`${id} · ${side}: ${file} (${Math.round(data.length * 0.75 / 1024)} KB)`);
    }
  }
} catch (error) {
  failed = true;
  console.error(error.message);
} finally {
  await Promise.race([send("Browser.close").catch(() => {}), sleep(3000)]);
  socket.close();
  browser.kill();
  await sleep(500);
  rmSync(profile, { recursive: true, force: true });
  process.exit(failed ? 1 : 0);
}
