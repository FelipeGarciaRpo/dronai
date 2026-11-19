// Estilos que comparten la portada, /reconstruir y los visores, para que todas las páginas se vean iguales.
// Los colores (paper, ink, rule…) cambian con el tema: están definidos en app/globals.css.

export const container = "mx-auto max-w-300 px-5 sm:px-10";

/** Rótulo pequeño en mayúsculas que encabeza una sección o un paso. */
export const eyebrow = "font-mono text-xs font-normal tracking-[0.06em] text-ink-faint uppercase";

export const pageTitle =
  "text-[clamp(1.75rem,3.3vw,2.875rem)] leading-[1.1] font-medium tracking-[-0.035em] text-balance text-ink";

export const lead = "text-lg leading-relaxed text-pretty";

/** Enlace dentro de un texto. */
export const textLink =
  "underline decoration-rule-strong underline-offset-[3px] transition-colors hover:text-ink hover:decoration-ink";

export const primaryButton =
  "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-md bg-ink px-5 text-sm font-medium text-paper transition-opacity hover:opacity-85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

/** Botón de texto para volver al paso anterior. */
export const backLink =
  "inline-flex min-h-11 items-center gap-2 text-sm text-ink-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

/** Panel que flota sobre un lienzo 3D. */
export const floatingPanel = "rounded-md border border-rule bg-paper/85 backdrop-blur";

// Fondo de los lienzos 3D: oscuro y neutro en los dos temas, para que los puntos claros de las nubes se vean.
export const CANVAS_BACKGROUND = "#0a0a0a";
