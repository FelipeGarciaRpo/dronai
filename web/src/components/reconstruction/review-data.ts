// Formato de review.json, el informe que genera el worker (`dronai-worker review`) al revisar una captura.
export type Verdict = "verde" | "amarillo" | "rojo";
export type Motion = "avanza" | "gira" | "quieto";
export type BreakKind = "corte" | "perdido" | "sin-solape";

export type CaptureReport = {
  version: number;
  source: {
    kind: "video" | "photos";
    name: string;
    width: number;
    height: number;
    count: number;
    duration?: number;
    fps?: number;
  };
  verdict: Verdict;
  summary: string;
  tier: string;
  issues: { code: string; level: "amarillo" | "rojo"; message: string; tip: string }[];
  metrics: {
    sharp: number;
    lit: number;
    detailed: number;
    moving: number | null;
    cuts: number;
    lost: number;
  };
  // t: segundos en un video, número de foto (desde 0) en una carpeta de fotos.
  timeline: { t: number; flags: string[] }[];
  pairs: { t0: number; t1: number; motion: Motion }[];
  breaks: { t: number; kind: BreakKind }[];
  thumbs?: { t: number; url: string }[];
};

const cache = new Map<string, Promise<CaptureReport | null>>();

// Devuelve null si el informe todavía no se generó (404).
export function loadReview(url: string) {
  let promise = cache.get(url);
  if (!promise) {
    promise = fetch(url).then((res) => (res.ok ? (res.json() as Promise<CaptureReport>) : null));
    cache.set(url, promise);
  }
  return promise;
}

// Las rutas de review.json (miniaturas) son relativas al propio archivo.
export function resolveFrom(reportUrl: string, path: string) {
  const url = new URL(path, new URL(reportUrl, window.location.href));
  return url.origin === window.location.origin ? url.pathname : url.toString();
}
