import Link from "next/link";
import { HeroCompare } from "@/components/landing/hero-compare";
import { LANDING_SCENES } from "@/components/landing/scenes";
import { SplitFrame, SplitLabel, StillPair } from "@/components/landing/split-view";
import { Logo } from "@/components/site/logo";
import { container, eyebrow } from "@/components/site/styles";
import { ThemeToggle } from "@/components/site/theme-toggle";

const sectionGap = "pt-[clamp(4rem,8vw,7rem)]";

const steps = ["Review the video", "Pick the frames", "Locate the cameras", "Train the splats", "Explore it on the web"];

export default function Home() {
  return (
    <div className="min-h-svh bg-paper text-ink-soft">
      <header className={`${container} flex flex-wrap items-center justify-between gap-x-6 pt-3.5`}>
        <Logo />
        <nav className="order-last flex w-full items-center gap-7 text-sm text-ink-muted sm:order-none sm:ml-auto sm:w-auto">
          <a href="#escenas" className="flex min-h-11 items-center transition-colors hover:text-ink">
            Scenes
          </a>
          <a href="#metodo" className="flex min-h-11 items-center transition-colors hover:text-ink">
            Method
          </a>
          <Link href="/reconstruir" className="flex min-h-11 items-center text-ink hover:underline hover:underline-offset-4">
            Step-by-step reconstruction
          </Link>
        </nav>
        <ThemeToggle />
      </header>

      <main>
        <section className={`${container} pt-[clamp(1.75rem,4vw,3.5rem)]`}>
          <h1 className="max-w-230 text-[clamp(1.75rem,3.3vw,2.875rem)] leading-[1.1] font-medium tracking-[-0.035em] text-balance text-ink">
            From drone video to a 3D scene you can explore in the browser
          </h1>
          <div className="mt-[clamp(1.75rem,3.4vw,2.75rem)]">
            <HeroCompare scenes={LANDING_SCENES}>
              <p className="max-w-130 text-lg leading-relaxed text-pretty">
                DronAI works out where each frame was taken from, trains Gaussian splats and publishes the scene on the
                web. The whole process runs on a laptop with a 4 GB GPU.
              </p>
            </HeroCompare>
          </div>
        </section>

        <section id="escenas" className={`${container} ${sectionGap} scroll-mt-4`}>
          <div className="grid gap-x-5 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {/* El título ocupa una celda: con las cinco escenas completa las filas de dos y de tres columnas. */}
            <div className="sm:pr-6">
              <h2 className={eyebrow}>Scenes</h2>
              <p className="mt-4 max-w-88 text-2xl leading-[1.15] font-medium tracking-[-0.025em] text-balance text-ink">
                Reconstructed from real drone imagery
              </p>
              <p className="mt-3 max-w-104 text-sm leading-relaxed text-ink-muted">
                Some come from a video, with camera poses computed by DronAI; others from photos with the dataset&apos;s
                poses.{" "}
                <span className="hidden [@media(hover:hover)]:inline">Hover over each one to compare</span>
                <span className="[@media(hover:hover)]:hidden">Drag across each one to compare</span> the point cloud
                with the splats, and open it to explore in 3D.
              </p>
            </div>
            <ul className="contents">
              {LANDING_SCENES.map((scene) => (
                <li key={scene.id}>
                  <Link href={scene.href} className="group block">
                    <SplitFrame className="aspect-[3/2] rounded-md">
                      <StillPair
                        points={scene.points.still}
                        splats={scene.splats.still}
                        alt={`${scene.title}: point cloud on the left, Gaussian splats on the right`}
                        sizes="(min-width: 1024px) 352px, (min-width: 640px) 50vw, 100vw"
                      />
                      <SplitLabel small side="left" label="Point cloud" />
                      <SplitLabel small side="right" label="Splats" />
                    </SplitFrame>
                    <p className="mt-3 font-mono text-[11px] text-ink-faint">
                      {scene.fromVideo ? "Video · poses computed with COLMAP" : "Photos · poses from the dataset"}
                    </p>
                    <p className="mt-1 text-[15px] font-medium text-ink underline-offset-4 group-hover:underline">
                      {scene.title}
                    </p>
                    <p className="text-sm text-ink-faint">{scene.place}</p>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="metodo" className={`${container} ${sectionGap} scroll-mt-4`}>
          <h2 className={eyebrow}>Method</h2>
          <ol className="mt-5 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5">
            {steps.map((step, i) => (
              <li key={step} className="border-t border-rule-strong pt-3.5">
                <span className="block font-mono text-xs text-ink-faint">{String(i + 1).padStart(2, "0")}</span>
                <span className="mt-1.5 block text-[15px] font-medium tracking-[-0.01em] text-ink">{step}</span>
              </li>
            ))}
          </ol>
        </section>
      </main>

      <footer className={`${container} ${sectionGap} pb-8`}>
        <div className="flex flex-col gap-x-12 gap-y-1 border-t border-rule pt-5 md:flex-row md:items-start md:justify-between">
          <Logo />
          <p className="max-w-160 text-[13px] leading-relaxed text-ink-faint md:pt-3">
            Photo scenes:{" "}
            <a
              href="https://github.com/nickponline/dd-nerf-dataset"
              className="text-ink-soft underline decoration-rule-strong underline-offset-[3px] transition-colors hover:text-ink"
            >
              DroneDeploy NeRF Dataset
            </a>{" "}
            (CC BY-NC-SA 4.0). Videos from Wikimedia Commons: Daniel Taka (CC BY 4.0) and
            Raimond Spekking (CC BY-SA 4.0).
          </p>
        </div>
      </footer>
    </div>
  );
}
