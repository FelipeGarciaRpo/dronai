"use client";

import { Canvas, createPortal, extend, useFrame, useLoader, useThree } from "@react-three/fiber";
import { SparkRenderer as SparkRendererImpl, SplatMesh as SplatMeshImpl } from "@sparkjsdev/spark";
import { type RefObject, Suspense, use, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { PLYLoader } from "three/addons/loaders/PLYLoader.js";
import { usePointCloudGeometry } from "@/components/viewer/point-cloud";
import { loadScene, resolveAsset, type SceneData } from "@/components/viewer/scene-data";
import { cameraPath, phaseAt } from "./camera-path";

// La misma escena dos veces, con la misma cámara: a la izquierda del separador la nube de puntos y a la derecha
// los Gaussian splats. El lienzo es uno solo aunque cambie la escena: al cambiar `sceneUrl` se sueltan los splats y
// la nube de la anterior y se cargan los de la nueva, así que en memoria hay una escena a la vez.

const SparkRenderer = extend(SparkRendererImpl);
const SplatMesh = extend(SplatMeshImpl);

export const COMPARE_BACKGROUND = "#0b0f17";
const BACKGROUND = new THREE.Color(COMPARE_BACKGROUND);

// Un giro de -90° en X lleva (este, norte, arriba) a los ejes del visor: (este, arriba, sur).
const ENU_TO_VIEWER: [number, number, number] = [-Math.PI / 2, 0, 0];
const NO_ROTATION: [number, number, number] = [0, 0, 0];

type Props = {
  sceneUrl: string;
  /** Fracción del ancho a la izquierda del separador, de 0 a 1. La escribe la figura al mover el cursor. */
  split: RefObject<number>;
  /** Si la cámara avanza por el recorrido. */
  moving: boolean;
  /** Si hay que dibujar: false cuando la figura no está en pantalla o se está cambiando de escena. */
  active: boolean;
  /** Dónde arranca la cámara, como fracción del recorrido. Las imágenes fijas se capturan en 0. */
  startPhase?: number;
  /** Avance de la descarga de los splats de `sceneUrl`, de 0 a 1. Debe ser una función estable. */
  onProgress: (sceneUrl: string, fraction: number) => void;
  /** Avisa cuando terminó de cargar la nube de puntos de `sceneUrl`. Debe ser una función estable. */
  onPointsLoaded: (sceneUrl: string) => void;
  /** Avisa si el navegador pierde el contexto WebGL: el lienzo deja de dibujar y hay que crearlo de nuevo. */
  onContextLost?: () => void;
};

export default function SceneCompare({
  sceneUrl,
  split,
  moving,
  active,
  startPhase = 0,
  onProgress,
  onPointsLoaded,
  onContextLost,
}: Props) {
  // La nube va en una escena aparte, para dibujarla solo a la izquierda del separador.
  const [pointsScene] = useState(() => new THREE.Scene());

  return (
    <Canvas
      frameloop={active ? "always" : "never"}
      dpr={[1, 1.5]}
      gl={{ antialias: false }}
      camera={{ fov: 40, near: 0.1, far: 1000 }}
      onCreated={({ gl }) => {
        if (onContextLost) gl.domElement.addEventListener("webglcontextlost", onContextLost);
      }}
    >
      <color attach="background" args={[BACKGROUND]} />
      <Spark />
      <Suspense fallback={null}>
        <SceneContent
          key={sceneUrl}
          sceneUrl={sceneUrl}
          pointsScene={pointsScene}
          moving={moving}
          startPhase={startPhase}
          onProgress={onProgress}
          onPointsLoaded={onPointsLoaded}
        />
      </Suspense>
      <SplitRender pointsScene={pointsScene} split={split} />
    </Canvas>
  );
}

// El renderizador de splats vive lo mismo que el lienzo; lo que cambia con cada escena es la malla.
function Spark() {
  const gl = useThree((state) => state.gl);
  const options = useMemo(() => ({ renderer: gl }), [gl]);
  return <SparkRenderer args={[options]} />;
}

type ContentProps = Pick<Props, "sceneUrl" | "moving" | "onProgress" | "onPointsLoaded"> & {
  pointsScene: THREE.Scene;
  startPhase: number;
};

function SceneContent({ sceneUrl, pointsScene, moving, startPhase, onProgress, onPointsLoaded }: ContentProps) {
  const scene = use(loadScene(sceneUrl));
  const splats = scene?.splats;
  // Las opciones van memoizadas: si cambian, R3F recrea la malla y la vuelve a descargar.
  const meshOptions = useMemo(
    () =>
      splats && {
        url: resolveAsset(sceneUrl, splats.url),
        onProgress: (event: ProgressEvent) => {
          if (event.total > 0) onProgress(sceneUrl, Math.min(event.loaded / event.total, 0.99));
        },
        onLoad: () => onProgress(sceneUrl, 1),
      },
    [splats, sceneUrl, onProgress],
  );
  if (!scene || !splats || !meshOptions) return null;

  return (
    <>
      <SplatMesh args={[meshOptions]} rotation={splats.frame === "enu" ? ENU_TO_VIEWER : NO_ROTATION} />
      {createPortal(
        <Suspense fallback={null}>
          <RoundPoints url={resolveAsset(sceneUrl, scene.points.url)} size={scene.points.size * 1.2} />
          <Loaded sceneUrl={sceneUrl} onLoaded={onPointsLoaded} />
        </Suspense>,
        pointsScene,
      )}
      <PathCamera scene={scene} moving={moving} startPhase={startPhase} />
    </>
  );
}

// Puntos redondos que se achican con la distancia, con un tope en pantalla: desde el recorrido del dron hay puntos
// muy cerca de la cámara, y sin tope se verían como cuadrados enormes.
const POINTS_VERTEX = /* glsl */ `
  uniform float size;
  uniform float scale;
  uniform float maxSize;
  varying vec3 vColor;
  void main() {
    vColor = color;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = clamp(size * scale / -mvPosition.z, 1.0, maxSize);
    gl_Position = projectionMatrix * mvPosition;
  }
`;
const POINTS_FRAGMENT = /* glsl */ `
  varying vec3 vColor;
  void main() {
    vec2 offset = gl_PointCoord - 0.5;
    if (dot(offset, offset) > 0.25) discard;
    gl_FragColor = vec4(vColor, 1.0);
    #include <colorspace_fragment>
  }
`;
const MAX_POINT_PIXELS = 5;

// useLoader guarda cada nube para siempre, y las de las escenas de fotos tienen 1,5 millones de puntos. Al mostrar
// otra escena se suelta la anterior. Se hace al montar la nueva y no al desmontar, porque en desarrollo React
// desmonta y vuelve a montar cada componente una vez.
let cachedPointsUrl: string | null = null;

function RoundPoints({ url, size }: { url: string; size: number }) {
  const geometry = usePointCloudGeometry(url);
  const material = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(() => ({ size: { value: size }, scale: { value: 1 }, maxSize: { value: 1 } }), [size]);

  useEffect(() => {
    if (cachedPointsUrl && cachedPointsUrl !== url) useLoader.clear(PLYLoader, cachedPointsUrl);
    cachedPointsUrl = url;
  }, [url]);

  // Igual que PointsMaterial: el tamaño se escala con la altura del lienzo en píxeles reales.
  useFrame(({ gl, size: canvas }) => {
    if (!material.current) return;
    const ratio = gl.getPixelRatio();
    material.current.uniforms.scale.value = ratio * canvas.height * 0.5;
    material.current.uniforms.maxSize.value = MAX_POINT_PIXELS * ratio;
  });

  return (
    <points geometry={geometry}>
      <shaderMaterial
        ref={material}
        vertexColors
        uniforms={uniforms}
        vertexShader={POINTS_VERTEX}
        fragmentShader={POINTS_FRAGMENT}
      />
    </points>
  );
}

// Se monta en el mismo Suspense que la nube, así que su efecto corre cuando la nube ya cargó.
function Loaded({ sceneUrl, onLoaded }: { sceneUrl: string; onLoaded: (sceneUrl: string) => void }) {
  useEffect(() => onLoaded(sceneUrl), [sceneUrl, onLoaded]);
  return null;
}

// Mueve la cámara por el recorrido de la escena (ver camera-path.ts).
function PathCamera({ scene, moving, startPhase }: { scene: SceneData; moving: boolean; startPhase: number }) {
  const path = useMemo(() => cameraPath(scene), [scene]);
  const turns = useRef(startPhase);

  useFrame(({ camera }, delta) => {
    if (camera instanceof THREE.PerspectiveCamera && camera.fov !== path.fov) {
      camera.fov = path.fov;
      camera.updateProjectionMatrix();
    }
    if (moving) turns.current += Math.min(delta, 0.1) / path.seconds;
    path.place(phaseAt(turns.current, path.pingPong), camera);
  });
  return null;
}

// Dibuja los splats en todo el lienzo y encima, recortada a la izquierda del separador, la nube de puntos.
function SplitRender({ pointsScene, split }: { pointsScene: THREE.Scene; split: RefObject<number> }) {
  useFrame(({ gl, scene, camera, size }) => {
    gl.render(scene, camera);
    const width = Math.round(size.width * split.current);
    if (width <= 0) return;
    gl.setScissorTest(true);
    gl.setScissor(0, 0, width, size.height);
    gl.setClearColor(BACKGROUND, 1);
    gl.render(pointsScene, camera); // borra solo el recorte (autoClear respeta el scissor) y dibuja la nube
    gl.setScissorTest(false);
  }, 1);
  return null;
}
