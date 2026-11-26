import type { Metadata } from "next";
import Link from "next/link";
import { CANVAS_BACKGROUND, textLink } from "@/components/site/styles";
import { RealSceneViewer } from "@/components/viewer/scene-viewer";
import { ViewerHint, ViewerPanel } from "@/components/viewer/viewer-panel";

export const metadata: Metadata = {
  title: "A real house, reconstructed · DronAI",
  description: "A house reconstructed with Gaussian splats from 220 real drone photos.",
};

export default function House1Page() {
  return (
    <main className="relative h-dvh w-full overflow-hidden" style={{ background: CANVAS_BACKGROUND }}>
      <RealSceneViewer sceneUrl="/scenes/house1/scene.json" />
      <ViewerPanel title="A real house, reconstructed">
        <p>This house was reconstructed from 220 real photos taken by a DJI Phantom 4 drone.</p>
        <p>
          What you see are Gaussian splats: about 328,000 blobs of color that DronAI adjusted for 12 minutes, on a
          laptop with an RTX 3050, until the scene looked like the photos from every angle. What the drone barely
          saw, at the edges, stays blurry.
        </p>
        <p>
          Here the camera poses are the ones that come with the dataset. For scenes made from a video, like the
          Kallang tower, DronAI computes them on its own with COLMAP.
        </p>
        <p>
          With the buttons below you can compare the splats with the point cloud DroneDeploy computed and see where
          each photo was taken from.
        </p>
        <p>
          <Link href="/reconstruir" className={`font-medium text-ink ${textLink}`}>
            See the step-by-step reconstruction
          </Link>{" "}
          →
        </p>
        <p className="text-xs text-ink-faint">
          Data:{" "}
          <a href="https://github.com/nickponline/dd-nerf-dataset" className={`text-ink-soft ${textLink}`}>
            DroneDeploy NeRF Dataset
          </a>{" "}
          · CC BY-NC-SA 4.0
        </p>
        <ViewerHint camera="orbit" />
      </ViewerPanel>
    </main>
  );
}
