// Línea de tiempo de la reconstrucción: tres etapas que se reproducen en orden y luego "Listo".

export const STAGES = [
  {
    title: "Fotos en el espacio",
    seconds: 8,
    text: "Cada foto aparece en la posición y la dirección desde donde la tomó el dron, siguiendo su recorrido.",
  },
  {
    title: "Nube de puntos",
    seconds: 16,
    text: "Cada foto aporta los puntos del terreno que ve más de cerca, y estos vuelan hasta su lugar.",
  },
  {
    title: "Gaussian splats",
    seconds: 12,
    text: "La GPU ajusta cientos de miles de manchas de color hasta que, desde cada foto, la escena se ve igual que la foto.",
  },
] as const;

export const PHOTOS = 0;
export const POINTS = 1;
export const SPLATS = 2;
export const DONE = STAGES.length;

export const TOTAL_SECONDS = STAGES.reduce((sum, stage) => sum + stage.seconds, 0);

export function stageStart(index: number) {
  return STAGES.slice(0, index).reduce((sum, stage) => sum + stage.seconds, 0);
}

/** Etapa en el segundo t y cuánto lleva de ella (de 0 a 1). Después de la última, la etapa es DONE. */
export function locate(t: number): { stage: number; local: number } {
  let start = 0;
  for (let stage = 0; stage < STAGES.length; stage++) {
    const { seconds } = STAGES[stage];
    if (t < start + seconds) return { stage, local: Math.max(0, (t - start) / seconds) };
    start += seconds;
  }
  return { stage: DONE, local: 1 };
}

/** Avance de una etapa en el segundo t: 0 antes de empezar, de 0 a 1 durante y 1 después. */
export function progressOf(stage: number, t: number) {
  const where = locate(t);
  if (where.stage < stage) return 0;
  if (where.stage > stage) return 1;
  return where.local;
}

// Reloj compartido entre la escena 3D (que lo avanza en cada frame) y los controles.
export type Clock = {
  time: number;
  playing: boolean;
  speed: number;
  /** La escena ya cargó las fotos y la nube, y empezó a reproducirse. */
  started: boolean;
  /** Ya cargaron todas las capturas del entrenamiento (si no, la etapa de splats espera). */
  splatsReady: boolean;
  /** Foto que está aportando sus puntos ahora mismo (-1 fuera de esa etapa). */
  emitter: number;
  /** Paso del entrenamiento que se está mostrando (0 antes de la etapa de splats). */
  step: number;
  /** La cámara se mueve sola hasta que el visitante la toca. */
  autoCamera: boolean;
};

export const INITIAL_CLOCK: Clock = {
  time: 0,
  playing: true,
  speed: 1,
  started: false,
  splatsReady: false,
  emitter: -1,
  step: 0,
  autoCamera: true,
};

export function smoothstep(edge0: number, edge1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
