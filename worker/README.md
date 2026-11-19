# DronAI · worker

Pipeline de reconstrucción en Python: recibe fotos o un video y devuelve una escena 3D lista para el visor.

## Ya funciona: la casa del DroneDeploy NeRF Dataset

La escena `house1` trae 220 fotos de dron, sus poses de cámara y una nube densa calculada por DroneDeploy. Con ella el
worker genera todo lo que usa la web: la galería de fotos, la nube que se arma foto a foto, los Gaussian splats y las
capturas del entrenamiento para `/reconstruir`.

```bash
# 1. Descargar la escena (1.7 GB, CC BY-NC-SA 4.0) y descomprimirla en data/dnf/house1/
uvx gdown 1NllCUWwDow5XUklZRA8BCraeipBL_bll -O ../data/dnf/house1.zip

# 2. Escena web: miniaturas, poses y nube de puntos (cada punto guarda qué foto lo ve más de cerca)
uv run dronai-worker dnf-import ../data/dnf/house1/house1 ../web/public/scenes/house1 --id house1 --title "Casa con piscina"

# 3. Datos de entrenamiento: fotos sin distorsión a 1600 px y un modelo COLMAP con las poses del dataset
uv run dronai-worker dnf-train-data ../data/dnf/house1/house1 ../data/prepared/house1

# 4. Entrenar los splats con Brush y guardar una captura cada 500 pasos
.tools/brush-0.3.0/brush_app.exe ../data/prepared/house1 --total-steps 7000 --max-splats 1000000 \
  --max-resolution 1600 --export-every 500 --export-path ../outputs/house1/brush-steps

# 5. Splats finales y capturas del entrenamiento para el visor
uv run dronai-worker splats-export ../outputs/house1/brush-steps/export_7000.ply ../web/public/scenes/house1 \
  --method "Gaussian splats entrenados por DronAI con Brush 0.3.0"
uv run dronai-worker splats-training ../outputs/house1/brush-steps ../web/public/scenes/house1 \
  --steps 500,1000,2000,3500,5000,7000 --total-steps 7000
```

La web usa SPZ, que conserva los armónicos esféricos (el color que cambia con el ángulo de vista) y pesa entre un
25 y un 37 % menos que el `.splat`. Después del paso 5 (o en su lugar), desde `web/`:

```bash
node scripts/splats-to-spz.mjs ../outputs/house1/brush-steps public/scenes/house1
```

Convierte con la librería Spark los splats finales y las capturas del entrenamiento, y actualiza `scene.json`.

Para `pipes1` (zip `1-eprcxUyd38qBigOIz3zNmi6m8twtttW`, 1,3 GB) y `house3` (zip `17O5ljqJA3J802ZQGGVa9ykiVf7WhNUrG`,
1,4 GB) son los mismos comandos cambiando el nombre de la escena.

Las escenas generadas no se suben al repositorio (`web/public/scenes/` y `web/public/revisiones/` están en
`.gitignore`).

### Medido en la laptop (RTX 3050 Laptop, 4 GB)

| Paso | Tiempo | Resultado |
| --- | --- | --- |
| `dnf-import` | ~1 min | 220 miniaturas y 1,5 millones de puntos con su foto |
| `dnf-train-data` | 11 s | 220 fotos de 1600×1200 sin distorsión |
| Brush, 7.000 pasos | 11,5 min (14,7 si reserva fotos para evaluar) | ~330 mil splats, ~1,9 GB de VRAM |
| Brush en `pipes1` y `house3` | 13,4 y 14,4 min | ~1 millón de splats (llegó al tope) y 762 mil |
| `splats-export` y `splats-training` | segundos | `.splat` de ~10 MB por captura (32 bytes por splat) |

### Detalles que costó descubrir

- El `cameras.xml` del dataset usa el formato de Agisoft, pero sus coeficientes tangenciales `p1` y `p2` siguen la
  convención de OpenCV. Lo comprobé proyectando la nube densa sobre 18 fotos: con OpenCV queda a 0,5 px de la imagen,
  y con la convención de Agisoft, a 2 px.
- Para la animación, cada punto se asigna a la foto que lo ve **más de cerca**. Si se usara la primera foto que lo ve,
  tres fotos tomadas desde lejos se quedarían con el 44 % de la nube.
- Brush nombra las capturas `export_0500.ply` (con ceros a la izquierda).

## De un video a 3D, con poses propias

Para un video no hay poses conocidas: las calcula COLMAP a partir de cuadros clave del propio video. Ejemplo con la
torre del aeropuerto de Kallang (Wikimedia Commons, CC BY 4.0):

```bash
# 1. Cuadros clave: la toma continua más larga, nítidos y espaciados por paralaje
uv run dronai-worker keyframes ../data/videos/giro-360/video.webm ../data/prepared/kallang

# 2. COLMAP: puntos SIFT en GPU, emparejamiento de todos contra todos (cierra las órbitas), mapper incremental con
#    una captura cada 10 cámaras ubicadas y fotos sin distorsión para entrenar
C=.tools/colmap-4.2.1/bin/colmap.exe; W=../data/prepared/kallang
$C feature_extractor --database_path $W/database.db --image_path $W/images \
  --ImageReader.single_camera 1 --ImageReader.camera_model SIMPLE_RADIAL
$C exhaustive_matcher --database_path $W/database.db
$C mapper --database_path $W/database.db --image_path $W/images --output_path $W/sparse \
  --Mapper.snapshot_path $W/snapshots --Mapper.snapshot_frames_freq 10
$C image_undistorter --image_path $W/images --input_path $W/sparse/0 --output_path $W/undistorted \
  --output_type COLMAP --max_image_size 1600

# 3. Alinear (COLMAP no sabe dónde es "arriba" ni cuánto mide nada) y escribir la escena web y los datos para Brush
uv run dronai-worker colmap-import $W ../web/public/scenes/kallang --id kallang --title "Torre del aeropuerto de Kallang" \
  --sensor "Video de dron, 1920×1080" --source-name "Daniel Taka (Wikimedia Commons)" --license "CC BY 4.0" \
  --source-url "https://commons.wikimedia.org/wiki/File:Kallang_Airport,_360_degree_view.webm"

# 4. Splats como en las escenas de fotos, sobre los datos alineados
.tools/brush-0.3.0/brush_app.exe $W/aligned --total-steps 7000 --max-splats 1000000 --max-resolution 1600 \
  --export-every 500 --export-path ../outputs/kallang/brush-steps
```

Medido en la laptop (los dos mappers corrieron a la vez, y en parte junto con Brush):

| Paso | Torre (114 cuadros) | Abadía (73 cuadros) |
| --- | --- | --- |
| Cuadros clave | ~1 min | ~1 min |
| Puntos SIFT en GPU | 7 s | 4 s |
| Emparejamiento de todos contra todos | 6,6 min | 1,8 min |
| Mapper incremental | 8,2 min (114 de 114 ubicadas) | 7,9 min (73 de 73) |
| Fotos sin distorsión | 3 s | 2 s |
| Brush, 7.000 pasos | 8,6 min (353 mil splats, 11 MB) | 7,9 min (133 mil splats, 4 MB) |

El emparejamiento de todos contra todos crece con el cuadrado de la cantidad de cuadros: sirve hasta unos 150. Para
videos más largos conviene el emparejamiento secuencial con detección de bucles y `global_mapper`.

La alineación estima la vertical con los ejes "derecha" de las cámaras: un dron o un celular casi nunca graban
inclinados de lado, así que esos ejes son horizontales y la vertical es la dirección más perpendicular a todos. Después
centra la escena y la lleva a una escala de trabajo (20 unidades de distancia mediana cámara–centro): sin GPS no hay
metros.

## Entrenar en Kaggle, gratis: gsplat con Difix3D+

Para lo que no cabe en 4 GB de VRAM, el notebook [kaggle/difix3d.ipynb](kaggle/difix3d.ipynb) usa las dos T4 de 16 GB de
Kaggle. Entrena la misma escena dos veces en paralelo, 60.000 pasos cada una: con gsplat normal y con
[Difix3D+](https://research.nvidia.com/labs/toronto-ai/difix3d) (NVIDIA, CVPR 2025), que en la segunda mitad dibuja
vistas nuevas, les quita las manchas con un modelo de difusión y las suma al entrenamiento. Esas vistas avanzan hacia
dos anillos de vistas altas y lejanas, como las del visor web; los ajustes al código de NVIDIA y el porqué están en
[docs/arquitectura.md](../docs/arquitectura.md#difix3d-en-kaggle). Compara PSNR, SSIM y LPIPS en los cuadros apartados
(1 de cada 8), dibuja los dos modelos desde las vistas lejanas y los exporta en PLY.

1. Empaquetar la escena alineada:
   `uv run dronai-worker kaggle-pack ../data/prepared/kallang/aligned ../outputs/kaggle/dronai-kallang.zip --name kallang`
2. En Kaggle, *Datasets → New Dataset*: subir el zip como dataset privado (Kaggle lo descomprime).
3. *Code → New Notebook → File → Import Notebook*: elegir `kaggle/difix3d.ipynb`.
4. En *Settings*: *Accelerator* **GPU T4 x2** e *Internet* **On** (pide verificar el teléfono). En *Add Input*, el
   dataset del paso 2.
5. *Save Version → Save & Run All*. Antes de entrenar, una celda verifica los imports, las opciones, la lectura de la
   escena, la compilación de gsplat y la memoria de Difix; si algo falla se detiene ahí. Con Kallang tardó 2 h 20 min.
6. Bajar `resultados.zip` desde la pestaña *Output*: métricas, los dos modelos en PLY e imágenes de comparación. Para
   llevar un modelo a la web, copiarlo como `export_60000.ply` en una carpeta y, desde `web/`:
   `node scripts/splats-to-spz.mjs <carpeta> public/scenes/<escena> --final 60000 --final-only`.

En Kallang, las dos corridas empatan en el recorrido del dron (27,89 dB) y, desde arriba, la de Difix pierde casi todos
los velos y rayones (comparación en el [README principal](../README.md#difix3d-apuntado-a-lo-que-muestra-la-web)).

## Revisión de la captura

Antes de gastar GPU, `review` revisa un video o una carpeta de fotos y da un semáforo (verde, amarillo o rojo) con
los motivos y cómo grabar mejor. Corre en CPU. El diseño está en
[docs/arquitectura.md](../docs/arquitectura.md#revisión-de-la-captura-y-semáforo).

```bash
# Escenas de fotos: el informe queda junto a la escena web
uv run dronai-worker review ../data/dnf/house1/house1 --out ../web/public/scenes/house1/review.json

# Videos: además guarda 6 cuadros de muestra para la web
uv run dronai-worker review ../data/videos/noche/video.webm --out ../web/public/revisiones/noche/review.json --frames 6
```

Qué mide, sobre imágenes reducidas a 960 px (8 cuadros por segundo en un video):

| Medida | Cómo | Problema si |
| --- | --- | --- |
| Desenfoque | "Re-desenfoque" (Crété et al., 2007): cuánto detalle pierde la imagen al desenfocarla a propósito | > 0,78 (las fotos nítidas dan ~0,48; desenfocadas 1 px, ~0,70; 2 px, ~0,84) |
| Luz | Luma media y fracción de píxeles casi negros o quemados | Luma < 45, más de la mitad negra o más del 30 % quemada |
| Detalle | Fracción de celdas de 60 px con una esquina que se puede seguir | < 25 % de la imagen (cielo, agua, nieve, paredes lisas) |
| Paralaje | Seguimiento de puntos (KLT) o emparejamiento de fotos (SIFT); en cada tramo, el movimiento que ningún giro puro explica | < 0,3 % del ancho: la cámara solo gira |
| Continuidad | Cortes de edición (se pierde el seguimiento y la imagen cambia de golpe) y pérdidas del hilo por velocidad | Ninguna toma continua de 15 s, o pérdidas frecuentes |

Detalles que costó descubrir:

- **El paralaje se mide en píxeles, no en grados.** Como la focal de un video no se conoce, se prueban varias. Al
  pasar a grados, una focal más larga achica los mismos píxeles, y la "mejor focal" salía siempre la más larga.
- **Sin teleobjetivos.** Se prueban focales de 0,4 a 1,5 veces el ancho. Con focales más largas, desplazarse sobre un
  terreno casi plano se parece demasiado a girar, y la casa salía en rojo por "solo gira". Si las fotos traen la focal
  en el EXIF, se usa esa.
- **Tramos de hasta 4 s.** En tramos de 2 s, un dron que vuela lejos apenas se desplaza y parece que solo gira.
- **La varianza del Laplaciano no sirve para el desenfoque.** Confunde desenfoque con falta de detalle: un monumento
  nítido contra el cielo salía borroso.
- **Reintentar antes de dar el hilo por perdido.** Con 8 cuadros por segundo, un FPV rápido se mueve demasiado entre
  uno y otro. Pasando por los cuadros intermedios, las pérdidas del interior FPV bajaron de 166 a 54.

### Calibración

Siete videos de dron de Wikimedia Commons con licencia libre (cada uno con un problema distinto), un giro sintético
sin desplazamiento (una foto de `house1` vista con distintos giros) y las tres escenas del DroneDeploy NeRF Dataset:

| Captura | Qué es | Veredicto | Motivo principal |
| --- | --- | --- | --- |
| `house1`, `pipes1`, `house3` | Fotos de mapeo con dron | Verde | — |
| `giro-360` | El dron rodea una torre | Verde | — |
| `abadia` | Vuelo alto y lento alrededor de unas ruinas | Verde | — |
| `monumento` | Atardecer a contraluz, con dos cortes | Amarillo | 39 % casi liso; usaría la toma de 35 s |
| `interior-fpv` | Dron FPV que recorre un edificio por dentro | Amarillo | 5 cortes (usaría la toma de 129 s) y pérdidas del hilo |
| `carreras-fpv` | Carrera de drones FPV | Rojo | Pierde el hilo 46 veces por minuto |
| `showreel` | Montaje de 32 tomas | Rojo | Ninguna toma dura más de 12 s |
| `noche` | Puerto de noche | Rojo | 93 % demasiado oscuro |
| `sintetico-giro` | La cámara gira sin desplazarse | Rojo | Solo gira (paralaje 0,02 % del ancho) |

Los videos se bajan con sus autores y licencias a `data/videos/<id>/` (fuera del repositorio). Las pruebas
automáticas (`uv run pytest`) generan sus propios casos: un giro puro, un desplazamiento con dos capas a distinta
distancia y un vuelo sobre terreno plano visto en diagonal, el caso que engañó a la primera versión.

Tiempo en la laptop: unos 1–1,5 min para 220 fotos de 18 MP y unos 0,4 s por segundo de video a 1080p.

## Estado

- [x] Escenas del DroneDeploy NeRF Dataset con sus poses: `house1` (220 fotos), `pipes1` (97) y `house3` (182).
- [x] Poses propias con COLMAP 4.2.1 a partir de video: torre de Kallang y abadía de Jumièges.
- [x] Revisión de la captura con semáforo, calibrada con videos reales (`review`).
- [x] Gaussian splats con Brush en la laptop; 7.000 contra 30.000 pasos medidos en Kallang.
- [x] Conversión a SPZ con armónicos esféricos de grado 3 (`web/scripts/splats-to-spz.mjs`).
- [x] gsplat con Difix3D+ en Kaggle, apuntado a las vistas del visor web (Kallang).
- [x] Reconstrucción paso a paso en la web (`/reconstruir`).
- [ ] Mostrar en `/reconstruir` cómo COLMAP va ubicando las cámaras (las capturas del mapper ya se guardan).

COLMAP y Brush se descargan de sus releases oficiales en GitHub a `worker/.tools/` (fuera del repositorio).
