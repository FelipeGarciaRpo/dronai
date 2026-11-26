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
        This scene hasn&apos;t been generated on your machine yet. Follow the steps in <code>worker/README.md</code>.
      </p>
    );
  }

  const photos = scene.photos;
  const items = scene.cameras.items;
  const video = scene.video;
  const date = photos?.start
    ? new Date(photos.start).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
    : null;
  const seconds = video ? video.segment.end - video.segment.start : null;
  const stats = [
    [video ? "Keyframes" : "Photos", items.length.toLocaleString("en-US")],
    ["Camera", scene.sensor.replace(" - ", " ")],
    ["Resolution", photos ? `${photos.width} × ${photos.height}` : null],
    video
      ? ["Shot used", `${Math.round(seconds ?? 0)} s${video.segment.count > 1 ? ` (of ${video.segment.count} shots)` : ""}`]
      : ["Flight", photos?.minutes ? `${photos.minutes.toLocaleString("en-US")} min` : null],
    ["Altitude", photos?.altitude != null ? `${Math.round(photos.altitude)} m above ground` : null],
    ["Date", date],
    video && video.registered < video.keyframes
      ? ["Registered by COLMAP", `${video.registered} of ${video.keyframes}`]
      : null,
  ].filter((stat): stat is [string, string] => stat !== null && stat[1] !== null);

  return (
    <>
      <SiteHeader />
      <div className={`${container} pt-[clamp(0.75rem,2vw,1.5rem)] pb-20`}>
        <button type="button" onClick={onBack} className={backLink}>
          ← Choose another scene
        </button>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-x-10 gap-y-6">
          <div className="min-w-0">
            <p className={eyebrow}>Step 2 of 3 · The photos</p>
            <h1 className={`${pageTitle} mt-4`}>{dataset.title}</h1>
            <p className={`${lead} mt-4 max-w-160`}>
              {video
                ? `These are the ${items.length} keyframes DronAI picked from the video: sharp, and spaced just far enough apart to give parallax from one to the next. From them it worked out where the camera was and built the 3D world.`
                : `These are the ${items.length} photos the drone took, in flight order. DronAI will build the 3D world from them.`}
            </p>
          </div>
          <button type="button" onClick={onStart} className={primaryButton}>
            Reconstruct in 3D <span aria-hidden>→</span>
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
            <h2 className={eyebrow}>Capture review</h2>
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
                  alt={`Photo ${k + 1} of ${items.length}`}
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
          {video ? "Video" : "Photos"}:{" "}
          <a href={dataset.source.url} className={`${textLink} text-ink-soft`}>
            {dataset.source.name}
          </a>{" "}
          · {dataset.source.license}
        </p>
      </div>
    </>
  );
}
