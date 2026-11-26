"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import Link from "next/link";
import { type RefObject, Suspense, memo, use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type CameraPath, cameraPath } from "../landing/camera-path";
import { CANVAS_BACKGROUND, eyebrow, floatingPanel, textLink } from "../site/styles";
import { ThemeToggle } from "../site/theme-toggle";
import { followPath, usePathInput } from "../viewer/path-camera";
import { type SceneData, loadScene, resolveAsset, toShots } from "../viewer/scene-data";
import { VIEWER_HINTS } from "../viewer/viewer-panel";
import { AnimatedPoints } from "./animated-points";
import type { Dataset } from "./datasets";
import { PhotoFrames } from "./photo-frames";
import * as THREE from "three";
import {
  type Clock,
  DONE,
  INITIAL_CLOCK,
  POINTS,
  SPLATS,
  STAGES,
  TOTAL_SECONDS,
  locate,
  progressOf,
  smoothstep,
  stageStart,
} from "./timeline";
import { TrainingSplats } from "./training-splats";

// Avanza el reloj en cada frame. Se monta recién cuando cargaron las fotos y la nube (dentro del mismo
// Suspense), así la reproducción no arranca antes de tiempo.
function ClockDriver({ clockRef }: { clockRef: RefObject<Clock> }) {
  useFrame((_, delta) => {
    const clock = clockRef.current;
    clock.started = true;
    if (clock.playing) {
      let next = clock.time + Math.min(delta, 0.1) * clock.speed;
      // Si los splats todavía no cargaron, la reproducción espera al comienzo de esa etapa.
      if (!clock.splatsReady && next > stageStart(SPLATS)) next = stageStart(SPLATS);
      clock.time = Math.min(next, TOTAL_SECONDS);
      if (clock.time >= TOTAL_SECONDS) clock.playing = false;
    }
  });
  return null;
}

const ORBIT_FOV = 50;
// Lo que tarda la cámara en pasar de la vista general al recorrido del visor, o de vuelta.
const BLEND_SECONDS = 2;

type OrbitControlsState = { enabled: boolean; autoRotate: boolean; target: THREE.Vector3 };

/** Fase del recorrido cuya posición queda más cerca de `position`. */
function nearestPhase(path: CameraPath, position: THREE.Vector3, probe: THREE.PerspectiveCamera) {
  let best = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < 360; i++) {
    path.place(i / 360, probe);
    const distance = probe.position.distanceToSquared(position);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i / 360;
    }
  }
  return best;
}

// Mueve la cámara. Con las fotos y la nube, gira despacio alrededor de la escena y se acerca mientras se arma la nube,
// hasta que el visitante la toca; se puede orbitar libremente. Desde que aparecen los splats va por el mismo recorrido
// que el visor de /escenas (ver path-camera.tsx), que no muestra lo que el dron no vio: avanza sola mientras se
// entrenan y el visitante la mueve por el recorrido. Al pasar de un modo al otro vuela con suavidad.
function CameraDirector({ clockRef, scene }: { clockRef: RefObject<Clock>; scene: SceneData }) {
  const path = useMemo(() => cameraPath(scene), [scene]);
  const overview = useMemo(() => {
    const target = new THREE.Vector3(...scene.view.target);
    const view = new THREE.PerspectiveCamera();
    view.position.set(...scene.view.position);
    view.lookAt(target);
    return { position: view.position, quaternion: view.quaternion, distance: view.position.distanceTo(target) };
  }, [scene]);
  // Pose de la cámara al empezar el vuelo de un modo al otro; `t` va de 0 a 1 durante el vuelo.
  const blendRef = useRef({ t: 1, position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), fov: ORBIT_FOV });
  // Cámara auxiliar donde se calcula hacia dónde va la cámara de verdad.
  const probeRef = useRef(new THREE.PerspectiveCamera());
  const onPath = useRef(false);
  const wanted = useRef(0);
  const shown = useRef(0);
  const direction = useRef(1);
  const stopAutoCamera = useCallback(() => {
    clockRef.current.autoCamera = false;
  }, [clockRef]);
  usePathInput(path, wanted, stopAutoCamera, onPath);

  useFrame((state, delta) => {
    const clock = clockRef.current;
    const blend = blendRef.current;
    const probe = probeRef.current;
    const camera = state.camera as THREE.PerspectiveCamera;
    const controls = state.controls as unknown as OrbitControlsState | null;
    const { stage, local } = locate(clock.time);

    const wantPath = stage >= SPLATS;
    if (wantPath !== onPath.current) {
      onPath.current = wantPath;
      blend.t = 0;
      blend.position.copy(camera.position);
      blend.quaternion.copy(camera.quaternion);
      blend.fov = camera.fov;
      if (wantPath) {
        wanted.current = shown.current = nearestPhase(path, camera.position, probe);
        // En un recorrido que va y vuelve, avanza hacia el lado con más camino por delante.
        direction.current = path.pingPong && wanted.current > 0.5 ? -1 : 1;
      }
    }

    let fov = ORBIT_FOV;
    if (onPath.current) {
      if (controls) controls.enabled = controls.autoRotate = false;
      if (clock.autoCamera && clock.playing && stage < DONE) {
        const next = wanted.current + (direction.current * Math.min(delta, 0.1) * clock.speed) / path.seconds;
        wanted.current = path.pingPong ? THREE.MathUtils.clamp(next, 0, 1) : next;
      }
      path.place(followPath(path, shown, wanted, delta), probe);
      fov = path.fov;
    } else if (blend.t < 1) {
      // De vuelta a la vista general, al repetir o al volver a una etapa anterior. Los controles esperan a que llegue,
      // para retomar sin saltos.
      if (controls) controls.enabled = false;
      probe.position.copy(overview.position);
      probe.quaternion.copy(overview.quaternion);
    } else {
      if (!controls) return;
      controls.enabled = true;
      controls.autoRotate = clock.autoCamera && clock.playing;
      if (clock.autoCamera) {
        const closer = stage === POINTS ? smoothstep(0, 0.6, local) : 0;
        const offset = camera.position.clone().sub(controls.target);
        const current = offset.length();
        const distance = overview.distance * (1 - 0.35 * closer);
        offset.setLength(current + (distance - current) * Math.min(1, delta * 1.5));
        camera.position.copy(controls.target).add(offset);
      }
      return;
    }

    if (blend.t < 1) {
      blend.t = Math.min(1, blend.t + delta / BLEND_SECONDS);
      const ease = smoothstep(0, 1, blend.t);
      camera.position.lerpVectors(blend.position, probe.position, ease);
      camera.quaternion.slerpQuaternions(blend.quaternion, probe.quaternion, ease);
      fov = blend.fov + (fov - blend.fov) * ease;
    } else {
      camera.position.copy(probe.position);
      camera.quaternion.copy(probe.quaternion);
    }
    if (camera.fov !== fov) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
  });
  return null;
}

const Scene3D = memo(function Scene3D({
  scene,
  sceneUrl,
  clockRef,
}: {
  scene: SceneData;
  sceneUrl: string;
  clockRef: RefObject<Clock>;
}) {
  const shots = useMemo(() => toShots(scene), [scene]);
  const photoUrls = useMemo(
    () => scene.cameras.items.map((item) => (item.img ? resolveAsset(sceneUrl, item.img) : null)),
    [scene, sceneUrl],
  );
  const snapshots = useMemo(() => {
    const list = scene.training?.snapshots ?? (scene.splats ? [{ step: 0, url: scene.splats.url }] : []);
    return list.map((s) => ({ step: s.step, url: resolveAsset(sceneUrl, s.url) }));
  }, [scene, sceneUrl]);
  const frame = scene.training?.frame ?? scene.splats?.frame ?? "viewer";
  const hasPhotos = photoUrls.every((url) => url !== null);

  return (
    <Canvas
      dpr={[1, 1.5]}
      gl={{ antialias: false }}
      camera={{ position: scene.view.position, fov: ORBIT_FOV, near: 0.1, far: 1000 }}
    >
      <color attach="background" args={[CANVAS_BACKGROUND]} />
      <Suspense fallback={null}>
        {hasPhotos && (
          <PhotoFrames
            shots={shots}
            urls={photoUrls as string[]}
            fovY={scene.cameras.fovY}
            aspect={scene.cameras.aspect}
            depth={scene.cameras.frustumDepth * 3}
            clockRef={clockRef}
          />
        )}
        <AnimatedPoints
          url={resolveAsset(sceneUrl, scene.points.url)}
          shots={shots}
          size={scene.points.size * 1.5}
          clockRef={clockRef}
        />
        <ClockDriver clockRef={clockRef} />
        <CameraDirector clockRef={clockRef} scene={scene} />
      </Suspense>
      {snapshots.length > 0 && <TrainingSplats snapshots={snapshots} frame={frame} clockRef={clockRef} />}
      <OrbitControls
        makeDefault
        enableDamping
        target={scene.view.target}
        minDistance={2}
        maxDistance={250}
        autoRotateSpeed={0.4}
        onStart={() => {
          clockRef.current.autoCamera = false;
        }}
      />
    </Canvas>
  );
});

function PlayIcon({ playing }: { playing: boolean }) {
  return playing ? (
    <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden>
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden>
      <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" />
    </svg>
  );
}

function Controls({
  clockRef,
  totalSteps,
  camera,
}: {
  clockRef: RefObject<Clock>;
  totalSteps: number | null;
  /** Cómo se mueve la cámara al terminar, para las instrucciones. */
  camera: "drone" | "orbit";
}) {
  const [ui, setUi] = useState<Clock>(INITIAL_CLOCK);
  useEffect(() => {
    const id = setInterval(() => setUi({ ...clockRef.current }), 100);
    return () => clearInterval(id);
  }, [clockRef]);

  const update = (change: Partial<Clock>) => {
    Object.assign(clockRef.current, change);
    setUi({ ...clockRef.current });
  };
  const { stage } = locate(ui.time);
  const done = stage === DONE;
  const waitingSplats = stage === SPLATS && !ui.splatsReady;

  let text: string;
  if (!ui.started) text = "Loading the photos and the point cloud…";
  else if (done) text = `Done. ${VIEWER_HINTS[camera]}.`;
  else if (waitingSplats) text = "Loading the training snapshots…";
  else text = STAGES[stage].text;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 p-3 sm:p-4">
      <div className={`pointer-events-auto mx-auto max-w-3xl p-3 text-sm sm:p-4 ${floatingPanel}`}>
        <ol className="grid grid-cols-4 gap-3">
          {[...STAGES.map((s) => s.title), "Done"].map((title, i) => {
            const progress = i < DONE ? progressOf(i, ui.time) : done ? 1 : 0;
            const active = i === stage;
            return (
              <li key={title}>
                <button
                  type="button"
                  onClick={() => update({ time: i < DONE ? stageStart(i) : TOTAL_SECONDS, playing: i < DONE })}
                  className={`w-full text-left text-xs leading-tight transition-colors hover:text-ink sm:text-sm ${
                    active ? "font-medium text-ink" : progress > 0 ? "text-ink-muted" : "text-ink-faint"
                  }`}
                >
                  <span className="mr-1.5 font-mono text-xs font-normal text-ink-faint">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {title}
                </button>
                <div className="mt-2 h-0.5 overflow-hidden rounded-full bg-rule-strong">
                  <div className="h-full bg-ink" style={{ width: `${progress * 100}%` }} />
                </div>
              </li>
            );
          })}
        </ol>
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            aria-label={ui.playing ? "Pause" : done ? "Watch again" : "Play"}
            onClick={() => update(done ? { time: 0, playing: true, autoCamera: true } : { playing: !ui.playing })}
            className="grid size-9 shrink-0 place-items-center rounded-full bg-ink text-paper transition-opacity hover:opacity-85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            <PlayIcon playing={ui.playing} />
          </button>
          <button
            type="button"
            aria-label="Change speed"
            onClick={() => update({ speed: ui.speed === 4 ? 1 : ui.speed * 2 })}
            className="h-9 shrink-0 rounded-full border border-rule-strong px-3 font-mono text-[13px] text-ink transition-colors hover:border-ink-faint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            {ui.speed}×
          </button>
          <p className="min-w-0 flex-1 pl-1 text-ink-soft">
            {text}
            {stage === SPLATS && ui.step > 0 && totalSteps && (
              <span className="ml-1 font-mono text-[13px] whitespace-nowrap text-ink-muted">
                Step {ui.step.toLocaleString("en-US")} of {totalSteps.toLocaleString("en-US")}.
              </span>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

function Process({ scene, dataset, onBack }: { scene: SceneData; dataset: Dataset; onBack: () => void }) {
  const clockRef = useRef<Clock>({ ...INITIAL_CLOCK, splatsReady: !scene.training && !scene.splats });

  return (
    <div className="fixed inset-0" style={{ background: CANVAS_BACKGROUND }}>
      <Scene3D scene={scene} sceneUrl={dataset.sceneUrl} clockRef={clockRef} />
      <div
        className={`pointer-events-none absolute top-3 left-3 max-w-xs p-3.5 text-sm sm:top-4 sm:left-4 ${floatingPanel}`}
      >
        <div className="-mt-2 -mr-2 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBack}
            className="pointer-events-auto text-xs text-ink-muted transition-colors hover:text-ink"
          >
            ← Back to the photos
          </button>
          <span className="pointer-events-auto">
            <ThemeToggle />
          </span>
        </div>
        <p className={`${eyebrow} text-[11px]`}>Step 3 of 3 · The reconstruction</p>
        <h1 className="mt-1.5 text-base font-medium tracking-[-0.01em] text-ink">{dataset.title}</h1>
        <p className="mt-1.5 text-xs leading-relaxed text-ink-faint">
          {scene.video
            ? `Camera poses and point cloud: computed by DronAI with COLMAP. Video: ${dataset.source.name} · ${dataset.source.license}.`
            : `Camera poses and point cloud: ${dataset.source.name}.`}{" "}
          Splats: trained by DronAI.{" "}
          <Link href={`/escenas/${dataset.id}`} className={`pointer-events-auto text-ink-soft ${textLink}`}>
            Open in the full viewer
          </Link>
        </p>
      </div>
      <Controls
        clockRef={clockRef}
        totalSteps={scene.training?.totalSteps ?? null}
        camera={scene.video ? "drone" : "orbit"}
      />
    </div>
  );
}

export default function ProcessView({ dataset, onBack }: { dataset: Dataset; onBack: () => void }) {
  const scene = use(loadScene(dataset.sceneUrl));
  if (!scene) {
    return (
      <p className="p-6 text-ink-soft">
        This scene hasn&apos;t been generated on your machine yet. Follow the steps in <code>worker/README.md</code>.
      </p>
    );
  }
  return <Process scene={scene} dataset={dataset} onBack={onBack} />;
}
