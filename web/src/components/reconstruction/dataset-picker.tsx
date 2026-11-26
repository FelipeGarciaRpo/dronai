import Image from "next/image";
import { SiteHeader } from "../site/site-header";
import { container, eyebrow, lead, pageTitle } from "../site/styles";
import { DATASETS, type Dataset } from "./datasets";

export function DatasetPicker({ onPick, onUpload }: { onPick: (dataset: Dataset) => void; onUpload: () => void }) {
  return (
    <>
      <SiteHeader />
      <div className={`${container} pt-[clamp(1.75rem,4vw,3.5rem)] pb-20`}>
        <p className={eyebrow}>Step 1 of 3 · The images</p>
        <h1 className={`${pageTitle} mt-4`}>What do you want to reconstruct?</h1>
        <p className={`${lead} mt-4 max-w-160`}>
          Pick a set of drone photos. First you&apos;ll see the photos, then how DronAI turns them, step by step, into
          a 3D world you can explore.
        </p>

        <ul className="mt-[clamp(2rem,4.5vw,3.5rem)] grid gap-x-5 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {DATASETS.map((dataset) => (
            <li key={dataset.id}>
              <button
                type="button"
                onClick={() => onPick(dataset)}
                className="group block w-full rounded-md text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink"
              >
                <Image
                  unoptimized
                  src={dataset.cover}
                  alt={`One of the photos from ${dataset.title}`}
                  width={320}
                  height={240}
                  className="aspect-3/2 w-full rounded-md bg-tint object-cover"
                />
                <span className="mt-3 block text-[15px] font-medium text-ink">{dataset.title}</span>
                <span className="block text-sm text-ink-faint">{dataset.place}</span>
                <span className="mt-2 block text-sm leading-relaxed text-ink-muted">{dataset.description}</span>
                <span className="mt-3 block text-sm font-medium text-ink">
                  <span className="underline decoration-rule-strong underline-offset-4 transition-colors group-hover:decoration-ink">
                    Choose this scene
                  </span>{" "}
                  →
                </span>
              </button>
            </li>
          ))}

          <li>
            <button
              type="button"
              onClick={onUpload}
              className="group flex h-full w-full flex-col justify-center rounded-md border border-dashed border-rule-strong p-6 text-left transition-colors hover:border-ink-faint focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink"
            >
              <svg
                viewBox="0 0 24 24"
                className="size-7 text-ink-faint"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                aria-hidden
              >
                <path
                  d="M12 16V4m0 0 4.5 4.5M12 4 7.5 8.5M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="mt-4 flex flex-wrap items-center gap-2 text-[15px] font-medium text-ink">
                Upload your video
                <span className="rounded-full bg-tint px-2 py-0.5 font-mono text-[11px] font-normal text-ink-muted">
                  Coming soon
                </span>
              </span>
              <span className="mt-2 block text-sm leading-relaxed text-ink-muted">
                A drone or phone video, processed on a cloud GPU. In the meantime, see which videos work and how
                DronAI reviews them before reconstructing.
              </span>
              <span className="mt-3 block text-sm font-medium text-ink">
                <span className="underline decoration-rule-strong underline-offset-4 transition-colors group-hover:decoration-ink">
                  See the video review
                </span>{" "}
                →
              </span>
            </button>
          </li>
        </ul>
      </div>
    </>
  );
}
