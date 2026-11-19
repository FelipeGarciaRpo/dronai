"use client";

import Image from "next/image";
import { Suspense, use, useRef, useState } from "react";
import { SiteHeader } from "../site/site-header";
import { backLink, container, eyebrow, lead, pageTitle, textLink } from "../site/styles";
import { ReviewPanel, STATUS, StatusIcon, VerdictBadge } from "./capture-review";
import { type CaptureReport, loadReview } from "./review-data";

// Videos de prueba de la revisión. Los informes los genera el worker (ver worker/README.md).
type Example = {
  id: string;
  title: string;
  what: string;
  credit: { author: string; license: string; url?: string };
};

const COMMONS = "https://commons.wikimedia.org/wiki/File:";

const EXAMPLES: Example[] = [
  {
    id: "giro-360",
    title: "Torre del aeropuerto de Kallang",
    what: "El dron rodea la torre de control mirando siempre hacia ella.",
    credit: { author: "Daniel Taka", license: "CC BY 4.0", url: `${COMMONS}Kallang_Airport,_360_degree_view.webm` },
  },
  {
    id: "abadia",
    title: "Abadía de Jumièges",
    what: "Un vuelo alto y lento alrededor de las ruinas.",
    credit: { author: "Raimond Spekking", license: "CC BY-SA 4.0", url: `${COMMONS}Abbaye_de_Jumi%C3%A8ges_from_quadcopter.webm` },
  },
  {
    id: "interior-fpv",
    title: "Dron FPV dentro de un edificio",
    what: "Entra volando y recorre pasillos, salas y escaleras: el caso de un dron en interiores.",
    credit: {
      author: "AFC Bournemouth",
      license: "CC BY 3.0",
      url: `${COMMONS}FPV_Drone_Flythrough-_Inside_the_new_Performance_Centre.webm`,
    },
  },
  {
    id: "monumento",
    title: "Monumento al atardecer",
    what: "Contraluz, mucho cielo y un par de cortes de edición.",
    credit: { author: "Superfly Guys", license: "CC BY 3.0", url: `${COMMONS}Penshaw_Monument_Autumn_Sunset.webm` },
  },
  {
    id: "noche",
    title: "Puerto de noche",
    what: "Una terminal de contenedores filmada de noche.",
    credit: {
      author: "FILMING CORK",
      license: "CC BY 3.0",
      url: `${COMMONS}Aerial_views_at_night_of_Cork_Container_Terminal_(CCT)_in_Ringaskiddy,_County_Cork,_Ireland.webm`,
    },
  },
  {
    id: "showreel",
    title: "Montaje de tomas",
    what: "Un showreel: muchas tomas cortas de lugares distintos.",
    credit: { author: "Phil Conrad", license: "CC BY 3.0", url: `${COMMONS}Photodrones_UAV_drone_Showreel.webm` },
  },
  {
    id: "carreras-fpv",
    title: "Carrera de drones FPV",
    what: "Vuelo de carrera, rapidísimo, con lente ojo de pez.",
    credit: { author: "DV8 Racing", license: "CC BY 3.0", url: `${COMMONS}The_Sound_of_Drone_Racing_(LOUDNESS_WARNING).webm` },
  },
  {
    id: "sintetico-giro",
    title: "Giro en el lugar (sintético)",
    what: "Generado por DronAI con una foto de la casa: la cámara gira sin moverse de su lugar.",
    credit: { author: "DronAI, con una foto del DroneDeploy NeRF Dataset", license: "CC BY-NC-SA 4.0" },
  },
];

const reportUrl = (id: string) => `/revisiones/${id}/review.json`;

// Se piden la primera vez que se muestran (en el navegador), no al importar el módulo.
let reportsPromise: Promise<(CaptureReport | null)[]> | null = null;
function loadReports() {
  reportsPromise ??= Promise.all(EXAMPLES.map((e) => loadReview(reportUrl(e.id))));
  return reportsPromise;
}

const DO = [
  "Muévete despacio y de forma continua: rodea el lugar o recórrelo.",
  "Que cada parte se vea desde varias posiciones distintas.",
  "Buena luz pareja, de día; la exposición y el foco fijos si tu cámara lo permite.",
  "Una sola toma sin editar, de 30 segundos a 3 minutos.",
];
const DONT = [
  "Girar en el mismo punto: así no hay cómo medir profundidad.",
  "Grabar de noche, a contraluz o con el sol de frente.",
  "Montajes con cortes, transiciones o textos encima.",
  "Encuadres llenos de cielo, agua, nieve o paredes lisas.",
];

function Guide() {
  return (
    <div className="mt-[clamp(2rem,4.5vw,3.5rem)] grid gap-x-10 gap-y-8 md:grid-cols-2">
      {[
        { title: "Qué funciona", items: DO, verdict: "verde" as const },
        { title: "Qué no funciona", items: DONT, verdict: "rojo" as const },
      ].map((col) => (
        <div key={col.title} className="border-t border-rule-strong pt-4">
          <p className="font-medium text-ink">{col.title}</p>
          <ul className="mt-3 space-y-2 text-sm leading-relaxed text-ink-soft">
            {col.items.map((item) => (
              <li key={item} className="flex gap-2.5">
                <span className="mt-1 shrink-0" style={{ color: STATUS[col.verdict].fill }}>
                  <StatusIcon verdict={col.verdict} className="size-3.5" />
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function Examples() {
  const reports = use(loadReports());
  const [selected, setSelected] = useState(0);
  const detailRef = useRef<HTMLDivElement>(null);
  const available = EXAMPLES.map((example, i) => ({ example, report: reports[i] })).filter(
    (item): item is { example: Example; report: CaptureReport } => item.report !== null,
  );
  if (available.length === 0) {
    return (
      <p className="mt-4 text-sm text-ink-muted">
        Los informes de los videos de prueba todavía no están generados en tu equipo. Sigue los pasos de{" "}
        <code>worker/README.md</code>.
      </p>
    );
  }
  const current = available[Math.min(selected, available.length - 1)];

  return (
    <>
      <ul className="mt-8 grid grid-cols-2 gap-x-5 gap-y-8 md:grid-cols-4">
        {available.map(({ example, report }, i) => (
          <li key={example.id}>
            <button
              type="button"
              aria-pressed={i === selected}
              onClick={() => {
                setSelected(i);
                detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              className="group block h-full w-full rounded-md text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink"
            >
              <Image
                unoptimized
                src={`/revisiones/${example.id}/frames/02.jpg`}
                alt=""
                width={480}
                height={270}
                className={`aspect-video w-full rounded-md bg-tint object-cover outline-2 outline-offset-2 transition-[outline-color] ${
                  i === selected ? "outline-ink" : "outline-transparent group-hover:outline-rule-strong"
                }`}
              />
              <span className="mt-3 block">
                <VerdictBadge verdict={report.verdict} short />
              </span>
              <span className="mt-2 block text-sm font-medium text-ink">{example.title}</span>
              <span className="mt-0.5 block text-xs leading-relaxed text-ink-muted">{example.what}</span>
            </button>
          </li>
        ))}
      </ul>

      <div ref={detailRef} className="mt-[clamp(2.5rem,5vw,4rem)] scroll-mt-6">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <h3 className="text-lg font-medium tracking-[-0.015em] text-ink">{current.example.title}</h3>
          <p className="text-xs text-ink-faint">
            Video:{" "}
            {current.example.credit.url ? (
              <a href={current.example.credit.url} className={`${textLink} text-ink-soft`}>
                {current.example.credit.author}
              </a>
            ) : (
              current.example.credit.author
            )}{" "}
            · {current.example.credit.license}
          </p>
        </div>
        <ReviewPanel report={current.report} reportUrl={reportUrl(current.example.id)} />
      </div>
    </>
  );
}

export function UploadStep({ onBack }: { onBack: () => void }) {
  return (
    <>
      <SiteHeader />
      <div className={`${container} pt-[clamp(0.75rem,2vw,1.5rem)] pb-20`}>
        <button type="button" onClick={onBack} className={backLink}>
          ← Volver a las escenas
        </button>
        <p className={`${eyebrow} mt-4`}>Sube tu video · La subida llega en la Fase 2</p>
        <h1 className={`${pageTitle} mt-4 max-w-230`}>Antes de reconstruir, DronAI revisa tu video</h1>
        <p className={`${lead} mt-4 max-w-180`}>
          Un video malo no se arregla con IA: si está oscuro, borroso o la cámara no se desplaza, lo que agregue la IA
          sería inventado. Por eso, antes de gastar GPU, DronAI mira cada cuadro y te da un semáforo con los motivos y
          cómo grabar mejor.
        </p>

        <Guide />

        <blockquote className="mt-10 max-w-180 border-l border-rule-strong pl-5 text-sm leading-relaxed text-ink-soft">
          Para un modelo nítido, graba despacio, rodeando o recorriendo el lugar, con buena luz y sin cortes. Si tu
          video no cumple, igual lo intentamos: te diremos qué calidad se puede lograr y marcaremos las partes que la
          IA tuvo que estimar.
        </blockquote>

        <h2 className="mt-[clamp(4rem,8vw,7rem)] max-w-180 text-2xl leading-[1.15] font-medium tracking-[-0.025em] text-balance text-ink">
          Así revisó DronAI estos videos reales
        </h2>
        <p className="mt-3 max-w-180 text-sm leading-relaxed text-ink-muted">
          Videos de dron de Wikimedia Commons con licencia libre, cada uno con un problema distinto, más un giro
          sintético. La revisión corre en el procesador, sin GPU.
        </p>
        <Suspense fallback={<p className="mt-4 text-sm text-ink-faint">Cargando las revisiones…</p>}>
          <Examples />
        </Suspense>
      </div>
    </>
  );
}
