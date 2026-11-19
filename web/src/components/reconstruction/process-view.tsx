"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import Link from "next/link";
import { type RefObject, Suspense, memo, use, useEffect, useMemo, useRef, useState } from "react";
import { CANVAS_BACKGROUND, eyebrow, floatingPanel, textLink } from "../site/styles";
import { ThemeToggle } from "../site/theme-toggle";
import { type SceneData, loadScene, resolveAsset, toShots } from "../viewer/scene-data";
import { AnimatedPoints } from "./animated-points";
import type { Dataset } from "./datasets";
import { PhotoFrames } from "./photo-frames";
import * as THREE from "three";
import {
  type Clock,
  DONE,
  INITIAL_CLOCK,
  PHOTOS,
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
// Suspense), así la reproducción no arranca antes de tiempo. También mueve la cámara: gira despacio y
// se acerca mientras se arma la nube, hasta que el visitante la toca.
function ClockDriver({ clockRef, baseDistance }: { clockRef: RefObject<Clock>; baseDistance: number }) {
  useFrame((state, delta) => {
    const clock = clockRef.current;
    clock.started = true;
    if (clock.playing) {
      let next = clock.time + Math.min(delta, 0.1) * clock.speed;
      // Si los splats todavía no cargaron, la reproducción espera al comienzo de esa etapa.
      if (!clock.splatsReady && next > stageStart(SPLATS)) next = stageStart(SPLATS);
      clock.time = Math.min(next, TOTAL_SECONDS);
      if (clock.time >= TOTAL_SECONDS) clock.playing = false;
    }

    const controls = state.controls as unknown as { autoRotate: boolean; target: THREE.Vector3 } | null;
    if (!controls) return;
    const { stage, local } = locate(clock.time);
    controls.autoRotate = clock.autoCamera && clock.playing && stage < DONE;
    if (clock.autoCamera && stage < DONE) {
      const closer = stage === PHOTOS ? 0 : stage === POINTS ? smoothstep(0, 0.6, local) : 1;
      const offset = state.camera.position.clone().sub(controls.target);
      const current = offset.length();
      const wanted = baseDistance * (1 - 0.35 * closer);
      offset.setLength(current + (wanted - current) * Math.min(1, delta * 1.5));
      state.camera.position.copy(controls.target).add(offset);
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
  const baseDistance = new THREE.Vector3(...scene.view.position).distanceTo(new THREE.Vector3(...scene.view.target));

  return (
    <Canvas
      dpr={[1, 1.5]}
      gl={{ antialias: false }}
      camera={{ position: scene.view.position, fov: 50, near: 0.1, far: 1000 }}
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
        <ClockDriver clockRef={clockRef} baseDistance={baseDistance} />
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

function Controls({ clockRef, totalSteps }: { clockRef: RefObject<Clock>; totalSteps: number | null }) {
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
  if (!ui.started) text = "Cargando las fotos y la nube de puntos…";
  else if (done) text = "Listo. Arrastra para orbitar, usa la rueda para acercarte y explora la escena.";
  else if (waitingSplats) text = "Cargando las capturas del entrenamiento…";
  else text = STAGES[stage].text;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 p-3 sm:p-4">
      <div className={`pointer-events-auto mx-auto max-w-3xl p-3 text-sm sm:p-4 ${floatingPanel}`}>
        <ol className="grid grid-cols-4 gap-3">
          {[...STAGES.map((s) => s.title), "Listo"].map((title, i) => {
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
            aria-label={ui.playing ? "Pausar" : done ? "Ver de nuevo" : "Reproducir"}
            onClick={() => update(done ? { time: 0, playing: true, autoCamera: true } : { playing: !ui.playing })}
            className="grid size-9 shrink-0 place-items-center rounded-full bg-ink text-paper transition-opacity hover:opacity-85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            <PlayIcon playing={ui.playing} />
          </button>
          <button
            type="button"
            aria-label="Cambiar velocidad"
            onClick={() => update({ speed: ui.speed === 4 ? 1 : ui.speed * 2 })}
            className="h-9 shrink-0 rounded-full border border-rule-strong px-3 font-mono text-[13px] text-ink transition-colors hover:border-ink-faint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            {ui.speed}×
          </button>
          <p className="min-w-0 flex-1 pl-1 text-ink-soft">
            {text}
            {stage === SPLATS && ui.step > 0 && totalSteps && (
              <span className="ml-1 font-mono text-[13px] whitespace-nowrap text-ink-muted">
                Paso {ui.step.toLocaleString("es")} de {totalSteps.toLocaleString("es")}.
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
            ← Volver a las fotos
          </button>
          <span className="pointer-events-auto">
            <ThemeToggle />
          </span>
        </div>
        <p className={`${eyebrow} text-[11px]`}>Paso 3 de 3 · La reconstrucción</p>
        <h1 className="mt-1.5 text-base font-medium tracking-[-0.01em] text-ink">{dataset.title}</h1>
        <p className="mt-1.5 text-xs leading-relaxed text-ink-faint">
          {scene.video
            ? `Poses de cámara y nube de puntos: calculadas por DronAI con COLMAP. Video: ${dataset.source.name} · ${dataset.source.license}.`
            : `Poses de cámara y nube de puntos: ${dataset.source.name}.`}{" "}
          Splats: entrenados por DronAI.{" "}
          <Link href={`/escenas/${dataset.id}`} className={`pointer-events-auto text-ink-soft ${textLink}`}>
            Abrir en el visor completo
          </Link>
        </p>
      </div>
      <Controls clockRef={clockRef} totalSteps={scene.training?.totalSteps ?? null} />
    </div>
  );
}

export default function ProcessView({ dataset, onBack }: { dataset: Dataset; onBack: () => void }) {
  const scene = use(loadScene(dataset.sceneUrl));
  if (!scene) {
    return (
      <p className="p-6 text-ink-soft">
        Esta escena todavía no está generada en tu equipo. Sigue los pasos de <code>worker/README.md</code>.
      </p>
    );
  }
  return <Process scene={scene} dataset={dataset} onBack={onBack} />;
}
