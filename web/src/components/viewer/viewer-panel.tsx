import Link from "next/link";
import type { ReactNode } from "react";
import { floatingPanel } from "../site/styles";
import { ThemeToggle } from "../site/theme-toggle";

type Props = {
  title: string;
  /** Lugar de la escena, bajo el título. */
  place?: string;
  /** Párrafos y enlaces que explican lo que se ve. */
  children: ReactNode;
};

// Panel de texto que flota sobre un visor 3D a pantalla completa. Deja pasar el puntero al visor: solo sus enlaces
// y el botón de tema reciben clics.
export function ViewerPanel({ title, place, children }: Props) {
  return (
    <aside
      className={`pointer-events-none absolute top-4 right-4 left-4 max-w-sm p-4 text-sm leading-relaxed text-ink-soft sm:right-auto [&_a]:pointer-events-auto [&_button]:pointer-events-auto ${floatingPanel}`}
    >
      <div className="-mt-2 -mr-2 flex items-center justify-between gap-3">
        <Link href="/" className="text-xs text-ink-muted transition-colors hover:text-ink">
          ← DronAI
        </Link>
        <ThemeToggle />
      </div>
      <h1 className="text-base font-medium tracking-[-0.01em] text-ink">{title}</h1>
      {place && <p className="text-xs text-ink-faint">{place}</p>}
      <div className="mt-2 space-y-2">{children}</div>
    </aside>
  );
}

const HINTS = {
  free: "Drag to orbit · scroll to zoom · right-click to pan",
  // Visor de las escenas: la cámara va por el recorrido del carrusel de la portada (ver path-camera.tsx).
  drone: "Drag or use the ← → arrow keys to follow the drone's flight",
  orbit: "Drag or use the ← → arrow keys to circle around the scene",
};

/** Las instrucciones para moverse por el visor, al pie del panel. */
export function ViewerHint({ camera = "free" }: { camera?: keyof typeof HINTS }) {
  return <p className="text-xs text-ink-faint">{HINTS[camera]}</p>;
}
