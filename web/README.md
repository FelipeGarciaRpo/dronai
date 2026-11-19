# DronAI · web

App web de DronAI: la landing, el explorador de cada escena y la reconstrucción paso a paso.
La visión general del proyecto está en el [README principal](../README.md).

## Correr en local

```bash
npm install
npm run dev
```

Abre <http://localhost:3000>. Las escenas vienen en `public/scenes`; `/visor` tiene además una escena de demostración
generada por código.

En una laptop con dos GPU, asigna la NVIDIA al navegador (Configuración de gráficos de Windows) y compruébalo en
`chrome://gpu`; si no, Chrome puede usar la gráfica integrada.

## Estructura

- `src/app/page.tsx`: landing.
- `src/components/site/`: lo que comparten todas las páginas: logo, encabezado, botón de tema claro/oscuro y estilos
  (`styles.ts`). Los colores de cada tema están en `src/app/globals.css`.
- `src/components/landing/`: piezas de la landing.
  - `hero-compare.tsx`: la comparación grande (nube de puntos | Gaussian splats) con carrusel de escenas.
  - `split-view.tsx`: el marco con el separador y las dos imágenes fijas de cada escena.
  - `scene-compare.tsx` y `camera-path.ts`: el lienzo 3D de la comparación y el recorrido de la cámara.
  - `scenes.ts`: lo que la landing muestra de cada escena (títulos, cifras, imágenes).
- `src/app/captura/[id]/page.tsx` y `scripts/landing-stills.mjs`: generan las imágenes fijas de la landing.
- `src/app/escenas/`: el explorador de cada escena (`[id]`) y la página de `house1`, con su historia.
- `src/app/reconstruir/` y `src/components/reconstruction/`: la reconstrucción paso a paso y la revisión de capturas.
- `src/app/visor/page.tsx`: página del visor de demostración.
- `scripts/splats-to-spz.mjs`: convierte los splats entrenados (PLY) a SPZ y actualiza el `scene.json` de la escena.
- `src/components/viewer/`: visor 3D con React Three Fiber + [Spark](https://sparkjs.dev) (Gaussian splats).
  - `real-scene-canvas.tsx`: el visor de una escena real (splats, nube y fotos del dron).
  - `path-camera.tsx`: la cámara del explorador, sobre el mismo recorrido que la landing (`landing/camera-path.ts`).
  - `viewer-canvas.tsx`: canvas, renderer de Spark y controles de cámara.
  - `demo-terrain.ts`: escena de demostración generada por código.
  - `flight-path.tsx`: órbita del dron y cámaras de captura.

## Imágenes fijas de la landing

La landing compara la nube de puntos con los Gaussian splats de cada escena. El 3D en vivo solo se carga en la
comparación grande y en pantallas anchas; las comparaciones pequeñas, los celulares y la espera mientras carga el 3D
usan dos imágenes por escena: `public/scenes/<escena>/landing-puntos.webp` y `landing-splats.webp`. Se generan con el
servidor de desarrollo corriendo:

```bash
npm run dev
node scripts/landing-stills.mjs                  # todas las escenas
node scripts/landing-stills.mjs --only=kallang   # una sola
```

El script abre `/captura/<escena>` en Chrome sin ventana y guarda lo que se ve desde donde arranca la cámara. Esa
página solo existe en desarrollo. Hay que volver a generar las imágenes cuando cambian los splats de una escena o el
recorrido de la cámara (`src/components/landing/camera-path.ts`). Si Chrome no está en la ruta habitual, indícala con
la variable `CHROME_PATH`.

Next.js 16 trae cambios respecto a versiones anteriores: antes de tocar APIs de Next, revisa `AGENTS.md`.
