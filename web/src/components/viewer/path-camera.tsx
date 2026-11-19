"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import type { CameraPath } from "@/components/landing/camera-path";

// Cámara del visor sobre el mismo recorrido que la comparación de la portada (ver landing/camera-path.ts): en las
// escenas de video, el vuelo del dron mirando hacia donde miraba; en las de fotos, una vuelta alrededor del centro.
// Arrastrar en horizontal o las flechas ← → la mueven por el recorrido. No se inclina, no se acerca ni se desplaza,
// así no muestra lo que el dron no vio.

// Arrastrar el alto de la pantalla avanza lo que el carrusel recorre en este tiempo.
const SECONDS_PER_SCREEN = 25;
const SECONDS_PER_KEY = 2;
// Qué tan rápido la cámara alcanza el punto pedido: más alto, más rápido.
const SMOOTHING = 8;

export function PathCamera({ path }: { path: CameraPath }) {
  const gl = useThree((state) => state.gl);
  const invalidate = useThree((state) => state.invalidate);
  // Fracción del recorrido pedida y la que muestra la cámara, que la sigue con suavidad. En un recorrido cerrado no
  // se envuelven (pueden pasar de 1); en uno que va y vuelve se quedan entre 0 y 1.
  const wanted = useRef(0);
  const shown = useRef(0);

  useEffect(() => {
    const element = gl.domElement;
    let lastX: number | null = null;
    const moveTo = (to: number) => {
      wanted.current = path.pingPong ? Math.min(1, Math.max(0, to)) : to;
      invalidate();
    };
    const onDown = (event: PointerEvent) => {
      lastX = event.clientX;
      element.setPointerCapture(event.pointerId);
    };
    const onMove = (event: PointerEvent) => {
      if (lastX === null) return;
      const dx = event.clientX - lastX;
      lastX = event.clientX;
      moveTo(wanted.current - (dx / element.clientHeight) * (SECONDS_PER_SCREEN / path.seconds));
    };
    const onUp = (event: PointerEvent) => {
      lastX = null;
      if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      moveTo(wanted.current + (event.key === "ArrowRight" ? 1 : -1) * (SECONDS_PER_KEY / path.seconds));
    };
    element.addEventListener("pointerdown", onDown);
    element.addEventListener("pointermove", onMove);
    element.addEventListener("pointerup", onUp);
    element.addEventListener("pointercancel", onUp);
    window.addEventListener("keydown", onKey);
    return () => {
      element.removeEventListener("pointerdown", onDown);
      element.removeEventListener("pointermove", onMove);
      element.removeEventListener("pointerup", onUp);
      element.removeEventListener("pointercancel", onUp);
      window.removeEventListener("keydown", onKey);
    };
  }, [gl, invalidate, path]);

  useFrame((state, delta) => {
    const gap = wanted.current - shown.current;
    shown.current = Math.abs(gap) < 1e-5 ? wanted.current : shown.current + gap * (1 - Math.exp(-delta * SMOOTHING));
    path.place(path.pingPong ? shown.current : ((shown.current % 1) + 1) % 1, state.camera);
    // Con frameloop="demand" hay que pedir otro frame mientras la cámara siga en camino.
    if (shown.current !== wanted.current) invalidate();
  });

  return null;
}
