"use client";

import Image from "next/image";
import { use } from "react";
import { SiteHeader } from "../site/site-header";
import { backLink, container, eyebrow, lead, pageTitle, primaryButton, textLink } from "../site/styles";
import { loadScene, resolveAsset } from "../viewer/scene-data";
import { ReviewPanel } from "./capture-review";
import type { Dataset } from "./datasets";
import { loadReview } from "./review-data";

type Props = { dataset: Dataset; onBack: () => void; onStart: () => void };

export function PhotoGallery({ dataset, onBack, onStart }: Props) {
  const scene = use(loadScene(dataset.sceneUrl));
  const reviewUrl = dataset.sceneUrl.replace(/scene\.json$/, "review.json");
  const review = use(loadReview(reviewUrl));
  if (!scene) {
    return (
      <p className="p-6 text-ink-soft">
        Esta escena todavía no está generada en tu equipo. Sigue los pasos de <code>worker/README.md</code>.
      </p>
    );
  }

  const photos = scene.photos;
  const items = scene.cameras.items;
  const video = scene.video;
  const date = photos?.start
    ? new Date(photos.start).toLocaleDateString("es", { year: "numeric", month: "long", day: "numeric" })
    : null;
  const seconds = video ? video.segment.end - video.segment.start : null;
  const stats = [
    [video ? "Cuadros clave" : "Fotos", items.length.toLocaleString("es")],
    ["Cámara", scene.sensor.replace(" - ", " ")],
    ["Resolución", photos ? `${photos.width} × ${photos.height}` : null],
    video
      ? ["Toma usada", `${Math.round(seconds ?? 0)} s${video.segment.count > 1 ? ` (de ${video.segment.count} tomas)` : ""}`]
      : ["Vuelo", photos?.minutes ? `${photos.minutes.toLocaleString("es")} min` : null],
    ["Altura", photos?.altitude != null ? `${Math.round(photos.altitude)} m sobre el suelo` : null],
    ["Fecha", date],
    video && video.registered < video.keyframes
      ? ["Ubicados por COLMAP", `${video.registered} de ${video.keyframes}`]
      : null,
  ].filter((stat): stat is [string, string] => stat !== null && stat[1] !== null);

  return (
    <>
      <SiteHeader />
      <div className={`${container} pt-[clamp(0.75rem,2vw,1.5rem)] pb-20`}>
        <button type="button" onClick={onBack} className={backLink}>
          ← Elegir otra escena
        </button>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-x-10 gap-y-6">
          <div className="min-w-0">
            <p className={eyebrow}>Paso 2 de 3 · Las fotos</p>
            <h1 className={`${pageTitle} mt-4`}>{dataset.title}</h1>
            <p className={`${lead} mt-4 max-w-160`}>
              {video
                ? `Estos son los ${items.length} cuadros clave que DronAI eligió del video: nítidos y separados lo justo para que haya paralaje entre uno y otro. Con ellos calculó dónde estaba la cámara y armó el mundo 3D.`
                : `Estas son las ${items.length} fotos que tomó el dron, en el orden del vuelo. Con ellas DronAI va a armar el mundo 3D.`}
            </p>
          </div>
          <button type="button" onClick={onStart} className={primaryButton}>
            Reconstruir en 3D <span aria-hidden>→</span>
          </button>
        </div>

        <dl className="mt-[clamp(2rem,4.5vw,3.5rem)] grid grid-cols-2 gap-x-5 gap-y-5 sm:grid-cols-3 lg:grid-cols-6">
          {stats.map(([label, value]) => (
            <div key={label} className="border-t border-rule-strong pt-3">
              <dt className="text-xs text-ink-faint">{label}</dt>
              <dd className="mt-1 text-sm font-medium text-ink">{value}</dd>
            </div>
          ))}
        </dl>

        {review && (
          <section className="mt-[clamp(3rem,6vw,4.5rem)]">
            <h2 className={eyebrow}>Revisión de la captura</h2>
            <div className="mt-5">
              <ReviewPanel report={review} reportUrl={reviewUrl} compact />
            </div>
          </section>
        )}

        <ul className="mt-[clamp(3rem,6vw,4.5rem)] grid grid-cols-3 gap-1.5 sm:grid-cols-5 lg:grid-cols-8">
          {items.map((item, k) =>
            item.img ? (
              <li key={item.img} className="relative overflow-hidden rounded-sm bg-tint">
                <Image
                  unoptimized
                  src={resolveAsset(dataset.sceneUrl, item.img)}
                  alt={`Foto ${k + 1} de ${items.length}`}
                  width={320}
                  height={240}
                  loading="lazy"
                  className="aspect-4/3 w-full object-cover"
                />
                <span className="absolute bottom-1 left-1 rounded-sm bg-black/60 px-1 font-mono text-[10px] text-white">
                  {k + 1}
                </span>
              </li>
            ) : null,
          )}
        </ul>

        <p className="mt-8 text-[13px] text-ink-faint">
          {video ? "Video" : "Fotos"}:{" "}
          <a href={dataset.source.url} className={`${textLink} text-ink-soft`}>
            {dataset.source.name}
          </a>{" "}
          · {dataset.source.license}
        </p>
      </div>
    </>
  );
}
