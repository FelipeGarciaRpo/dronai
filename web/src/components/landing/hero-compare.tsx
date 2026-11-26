"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import {
  Component,
  type ReactNode,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { LandingScene } from "./scenes";
import { SplitFrame, SplitLabel, StillPair, useMedia } from "./split-view";

// El 3D usa WebGL, WASM y workers, así que solo se carga en el navegador.
const SceneCompare = dynamic(() => import("./scene-compare"), { ssr: false });

// Cada cuánto pasa sola a la siguiente escena y cuánto dura el fundido entre una y otra.
const ROTATE_MS = 30_000;
const FADE_MS = 700;
// Si el 3D de una escena no termina de cargar, el carrusel igual sigue: espera esto de más y pasa a la siguiente.
const LOAD_GRACE_MS = 15_000;
// Si el navegador pierde el contexto WebGL (pasa, por ejemplo, cuando el controlador de video se reinicia), el
// lienzo se vuelve a crear tras una pausa. A la tercera vez la portada se queda con las imágenes fijas.
const RECOVER_MS = 1500;
const MAX_OUTAGES = 3;

type Load = { url: string | null; progress: number; points: boolean };
const NOT_LOADED: Load = { url: null, progress: 0, points: false };

function subscribeToVisibility(onChange: () => void) {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

type Props = {
  scenes: LandingScene[];
  /** Texto de presentación, a la izquierda de las cifras. */
  children: ReactNode;
};

// Comparación grande de la portada, con carrusel: muestra una escena a la vez (nube de puntos | Gaussian splats) y
// pasa a la siguiente cada 30 s o con los botones. Las imágenes fijas se ven al instante; en pantallas anchas el 3D
// de esa misma vista carga encima y, cuando está listo, las reemplaza con la cámara en movimiento. En celulares se
// quedan las imágenes: una escena 3D pesa entre 4 y 46 MB.
export function HeroCompare({ scenes, children }: Props) {
  const wide = useMedia("(min-width: 768px)");
  const still = useMedia("(prefers-reduced-motion: reduce)");
  const pageVisible = useSyncExternalStore(
    subscribeToVisibility,
    () => !document.hidden,
    () => true,
  );
  const area = useRef<HTMLDivElement>(null);
  const split = useRef(0.5);

  // `view` es la escena que se muestra (imágenes, rótulos, cifras). `liveIndex`, la que está cargada en el lienzo
  // 3D: sigue a `view` con un retraso, para que el lienzo se desvanezca con la escena anterior todavía dibujada.
  const [view, setView] = useState({ index: 0, previous: 0 });
  const [liveIndex, setLiveIndex] = useState(0);
  const [load, setLoad] = useState(NOT_LOADED);
  const [outages, setOutages] = useState(0);
  const [recovering, setRecovering] = useState(false);
  const [onScreen, setOnScreen] = useState(true);
  const [engaged, setEngaged] = useState(false);
  const [focused, setFocused] = useState(false);
  const [auto, setAuto] = useState(true);

  const scene = scenes[view.index];
  const live = wide && outages < MAX_OUTAGES; // hay (o habrá) 3D
  const switching = liveIndex !== view.index;
  const loading = live && !recovering && !switching && load.url === scene.sceneUrl;
  const ready = loading && load.progress >= 1 && load.points;
  // El reloj de la escena se detiene mientras alguien la mira de cerca o no está a la vista.
  const running = auto && !still && scenes.length > 1 && onScreen && pageVisible && !engaged && !focused;
  const delay = live && !ready ? ROTATE_MS + LOAD_GRACE_MS : ROTATE_MS;

  const go = useCallback(
    (to: number) =>
      setView((current) => {
        const index = ((to % scenes.length) + scenes.length) % scenes.length;
        return index === current.index ? current : { index, previous: current.index };
      }),
    [scenes.length],
  );

  // Cuando el 3D termina de cargar, `delay` cambia y la cuenta vuelve a empezar: el 3D se ve los 30 s completos.
  useEffect(() => {
    if (!running) return;
    const timer = setTimeout(() => go(view.index + 1), delay);
    return () => clearTimeout(timer);
  }, [running, delay, view.index, go]);

  useEffect(() => {
    if (!switching) return;
    const timer = setTimeout(() => {
      setLiveIndex(view.index);
      setLoad(NOT_LOADED);
    }, FADE_MS);
    return () => clearTimeout(timer);
  }, [switching, view.index]);

  useEffect(() => {
    if (!recovering) return;
    const timer = setTimeout(() => setRecovering(false), RECOVER_MS);
    return () => clearTimeout(timer);
  }, [recovering]);

  // Deja de dibujar y de contar mientras la figura no se ve.
  useEffect(() => {
    const element = area.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const onProgress = useCallback(
    (url: string, progress: number) =>
      setLoad((current) => (current.url === url ? { ...current, progress } : { url, progress, points: false })),
    [],
  );
  const onPointsLoaded = useCallback(
    (url: string) =>
      setLoad((current) => (current.url === url ? { ...current, points: true } : { url, progress: 0, points: true })),
    [],
  );
  const onContextLost = useCallback(() => {
    setLoad(NOT_LOADED);
    setOutages((count) => count + 1);
    setRecovering(true);
  }, []);
  const onLiveError = useCallback(() => setOutages(MAX_OUTAGES), []);

  // Además de la escena actual quedan montadas la anterior (debajo, para el fundido) y la siguiente (invisible,
  // para que sus imágenes ya estén descargadas cuando le toque).
  const next = (view.index + 1) % scenes.length;
  const mounted = [...new Set([view.previous, view.index, next])];

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Reconstructed scenes"
      onFocus={(event) => event.target.matches(":focus-visible") && setFocused(true)}
      onBlur={(event) => !event.currentTarget.contains(event.relatedTarget) && setFocused(false)}
    >
      <div>
        <div ref={area}>
          <SplitFrame
            splitRef={split}
            handle
            onEngage={setEngaged}
            className="aspect-4/3 w-full rounded-md sm:aspect-video"
          >
            {mounted.map((i) => {
              const current = i === view.index;
              return (
                <StillPair
                  key={scenes[i].id}
                  points={scenes[i].points.still}
                  splats={scenes[i].splats.still}
                  alt={current ? `${scenes[i].title}: point cloud on the left, Gaussian splats on the right` : ""}
                  sizes="(min-width: 1200px) 1120px, 100vw"
                  eager={i === 0}
                  className={current ? "z-2" : i === view.previous ? "z-1" : "opacity-0"}
                  style={
                    current && view.index !== view.previous && !still
                      ? { animation: `landing-fade-in ${FADE_MS}ms ease-out` }
                      : undefined
                  }
                />
              );
            })}

            {live && !recovering && (
              <div
                style={{ transitionDuration: `${FADE_MS}ms` }}
                className={`absolute inset-0 z-5 transition-opacity ${ready ? "opacity-100" : "opacity-0"}`}
              >
                <LiveBoundary key={outages} onError={onLiveError}>
                  <Suspense fallback={null}>
                    <SceneCompare
                      sceneUrl={scenes[liveIndex].sceneUrl}
                      split={split}
                      moving={ready && !still}
                      active={onScreen && pageVisible && !switching}
                      onProgress={onProgress}
                      onPointsLoaded={onPointsLoaded}
                      onContextLost={onContextLost}
                    />
                  </Suspense>
                </LiveBoundary>
              </div>
            )}

            <SplitLabel side="left" label="Point cloud" detail={scene.points.detail} />
            <SplitLabel side="right" label="Gaussian splats" detail={scene.splats.detail} />

            {live && !ready && (
              <p className="absolute bottom-3 left-3 z-10 rounded bg-black/60 px-2.5 py-1 font-mono text-xs text-white/90">
                Loading the 3D scene · {Math.round((loading ? load.progress : 0) * 100)}%
              </p>
            )}
            {!live && (
              <Link
                href={scene.href}
                className="absolute right-3 bottom-3 z-30 rounded-md bg-white/90 px-3 py-1.5 text-sm font-medium text-zinc-900"
              >
                Open in 3D →
              </Link>
            )}
          </SplitFrame>
        </div>

        <div className="mt-3 flex flex-col gap-x-10 gap-y-1 md:flex-row md:items-start md:justify-between">
          <p className="max-w-204 pt-1.5 text-[13px] leading-relaxed text-pretty text-ink-faint">
            <span className="font-medium text-ink">{scene.title}</span>, {scene.place}. On the left, the point cloud{" "}
            {scene.fromVideo ? "computed by COLMAP" : "from the dataset"}; on the right, the Gaussian splats trained{" "}
            {scene.fromVideo ? "on top of it" : "on the drone photos"}.{" "}
            <span className="hidden [@media(hover:hover)]:inline">Move the cursor over the image to compare.</span>
            <span className="[@media(hover:hover)]:hidden">Drag across the image to compare.</span>{" "}
            {scene.fromVideo ? "Video" : "Photos"}:{" "}
            <a
              href={scene.source.url}
              className="underline decoration-rule-strong underline-offset-[3px] transition-colors hover:text-ink"
            >
              {scene.source.name}
            </a>
            , {scene.source.license}.
          </p>

          {scenes.length > 1 && (
            <div className="-ml-2.5 flex shrink-0 items-center text-ink-faint md:ml-0">
              {!still && (
                <IconButton
                  label={auto ? "Pause automatic scene switching" : "Resume automatic scene switching"}
                  onClick={() => setAuto((value) => !value)}
                >
                  {auto ? <path d="M9 6.5v11M15 6.5v11" /> : <path d="M9 6.5v11l8.5-5.5L9 6.5Z" />}
                </IconButton>
              )}
              <IconButton label="Previous scene" onClick={() => go(view.index - 1)}>
                <path d="M14.5 6.5 9 12l5.5 5.5" />
              </IconButton>
              <ol className="mx-1 flex items-center gap-1.5">
                {scenes.map((item, i) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => go(i)}
                      aria-label={`Show ${item.title}`}
                      aria-current={i === view.index ? "true" : undefined}
                      className="group flex h-9 items-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                    >
                      <span className="relative block h-0.5 w-6 overflow-hidden rounded-full bg-rule-strong transition-colors group-hover:bg-ink-faint">
                        {i === view.index && (
                          // La barra se llena mientras corre el tiempo de esta escena; quieta, queda llena.
                          <span
                            key={`${running}-${delay}`}
                            style={
                              running && delay === ROTATE_MS
                                ? { animation: `landing-fill ${ROTATE_MS}ms linear forwards` }
                                : undefined
                            }
                            className="absolute inset-0 origin-left bg-ink"
                          />
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
              <IconButton label="Next scene" onClick={() => go(view.index + 1)}>
                <path d="M9.5 6.5 15 12l-5.5 5.5" />
              </IconButton>
            </div>
          )}
        </div>
      </div>

      <div className="mt-[clamp(2rem,4.5vw,3.5rem)] flex flex-wrap items-start gap-x-18 gap-y-9">
        <div className="min-w-0 flex-[1.15] basis-100">
          {children}
          <div className="mt-4 flex flex-wrap gap-x-8 gap-y-1 text-[15px] font-medium text-ink">
            <Link href={scene.href} className="inline-flex min-h-11 items-center gap-2">
              <span className="underline decoration-1 underline-offset-[5px]">Explore the scene</span>
              <span aria-hidden>→</span>
            </Link>
            <Link href="/reconstruir" className="group inline-flex min-h-11 items-center gap-2">
              <span className="underline decoration-rule-strong decoration-1 underline-offset-[5px] transition-colors group-hover:decoration-ink">
                See the step-by-step reconstruction
              </span>
              <span aria-hidden>→</span>
            </Link>
          </div>
        </div>

        <dl className="min-w-0 flex-1 basis-90 border-b border-rule">
          {scene.stats.map(({ label, value }) => (
            <div key={label} className="flex items-baseline justify-between gap-4 border-t border-rule py-2.75">
              <dt className="text-sm text-ink-muted">{label}</dt>
              <dd className="font-mono text-[13px] text-ink tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

// Si el 3D falla (por ejemplo, un navegador sin WebGL2), la portada sigue con las imágenes fijas.
class LiveBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onError();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid size-9 place-items-center rounded-md transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
    >
      <svg
        viewBox="0 0 24 24"
        className="size-4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        {children}
      </svg>
    </button>
  );
}
