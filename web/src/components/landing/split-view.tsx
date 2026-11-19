"use client";

import Image from "next/image";
import { type CSSProperties, type ReactNode, type RefObject, useCallback, useRef, useSyncExternalStore } from "react";

// Piezas de la comparación "nube de puntos | Gaussian splats": un marco con un separador vertical que sigue al
// cursor (o al dedo, arrastrando) y dos imágenes fijas de la misma vista. El separador se mueve sin volver a
// renderizar: el marco escribe la fracción en la variable CSS --split, y quien la necesite en JavaScript (el lienzo
// 3D) la lee de `split`.

export function useMedia(query: string) {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const media = window.matchMedia(query);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

type FrameProps = {
  /** Capas que se dibujan dentro del marco, de atrás hacia adelante. */
  children: ReactNode;
  className?: string;
  /** Fracción del ancho a la izquierda del separador, de 0 a 1, para quien la lea en cada frame. */
  splitRef?: RefObject<number>;
  /** Con botón en el separador (se mueve también con las flechas del teclado) o solo la línea. */
  handle?: boolean;
  /** Avisa mientras alguien está comparando: cursor encima o dedo arrastrando. */
  onEngage?: (engaged: boolean) => void;
};

export function SplitFrame({ children, className = "", splitRef, handle = false, onEngage }: FrameProps) {
  const frame = useRef<HTMLDivElement>(null);
  const fractionRef = useRef(0.5);

  function moveTo(value: number) {
    const fraction = Math.min(0.98, Math.max(0.02, value));
    fractionRef.current = fraction;
    if (splitRef) splitRef.current = fraction;
    frame.current?.style.setProperty("--split", String(fraction));
  }

  return (
    <div
      ref={frame}
      style={{ "--split": 0.5 } as CSSProperties}
      className={`relative touch-pan-y overflow-hidden bg-[#0b0f17] select-none ${className}`}
      onPointerMove={(event) => {
        // Con mouse sigue al cursor; en pantallas táctiles, solo mientras se arrastra.
        if (event.pointerType !== "mouse" && event.buttons === 0) return;
        const box = event.currentTarget.getBoundingClientRect();
        moveTo((event.clientX - box.left) / box.width);
      }}
      onPointerEnter={(event) => event.pointerType === "mouse" && onEngage?.(true)}
      onPointerDown={() => onEngage?.(true)}
      onPointerLeave={() => onEngage?.(false)}
      onPointerUp={(event) => event.pointerType !== "mouse" && onEngage?.(false)}
      onPointerCancel={() => onEngage?.(false)}
    >
      {children}
      <div
        style={{ left: "calc(var(--split) * 100%)" }}
        className="pointer-events-none absolute inset-y-0 z-20 w-px -translate-x-1/2 bg-white/85"
      >
        {handle && (
          <button
            type="button"
            aria-label="Separador entre la nube de puntos y los splats: muévelo con las flechas"
            onKeyDown={(event) => {
              if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
              event.preventDefault();
              moveTo(fractionRef.current + (event.key === "ArrowLeft" ? -0.05 : 0.05));
            }}
            className="pointer-events-auto absolute top-1/2 left-1/2 grid size-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-white/70 bg-black/45 text-white backdrop-blur focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M8 7l-5 5 5 5M16 7l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

type PairProps = {
  points: string;
  splats: string;
  /** Qué muestra la comparación, para lectores de pantalla. */
  alt: string;
  /** Anchos a los que se muestra, como en <img sizes>. */
  sizes: string;
  /** Cargar ya, sin esperar a que entre en pantalla (la primera escena de la portada). */
  eager?: boolean;
  className?: string;
  style?: CSSProperties;
};

// Las dos imágenes fijas de una escena, una sobre la otra: los splats ocupan todo el marco y la nube de puntos se
// recorta a la izquierda del separador.
export function StillPair({ points, splats, alt, sizes, eager = false, className = "", style }: PairProps) {
  return (
    <div className={`absolute inset-0 ${className}`} style={style}>
      <Image
        src={splats}
        alt={alt}
        fill
        sizes={sizes}
        loading={eager ? "eager" : "lazy"}
        fetchPriority={eager ? "high" : "auto"}
        draggable={false}
        className="object-cover"
      />
      <Image
        src={points}
        alt=""
        fill
        sizes={sizes}
        loading={eager ? "eager" : "lazy"}
        draggable={false}
        className="object-cover"
        style={{ clipPath: "inset(0 calc(100% - var(--split) * 100%) 0 0)" }}
      />
    </div>
  );
}

type LabelProps = { label: string; detail?: string; side: "left" | "right"; small?: boolean };

// Rótulo de cada lado de la comparación.
export function SplitLabel({ label, detail, side, small = false }: LabelProps) {
  return (
    <p
      className={`pointer-events-none absolute z-10 rounded bg-black/55 text-white backdrop-blur-sm ${
        small ? "top-2 px-2 py-1" : "top-3 px-2.5 py-1.5"
      } ${side === "left" ? (small ? "left-2" : "left-3") : `text-right ${small ? "right-2" : "right-3"}`}`}
    >
      <span className={`block font-medium ${small ? "text-[11px]" : "text-[13px]"}`}>{label}</span>
      {/* En pantallas chicas los dos detalles no caben uno al lado del otro. */}
      {detail && <span className="hidden font-mono text-[11px] text-white/70 sm:block">{detail}</span>}
    </p>
  );
}
