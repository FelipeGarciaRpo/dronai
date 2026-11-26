"use client";

import dynamic from "next/dynamic";
import { Suspense, useEffect, useState } from "react";
import { DatasetPicker } from "./dataset-picker";
import type { Dataset } from "./datasets";
import { PhotoGallery } from "./photo-gallery";
import { UploadStep } from "./review-examples";

function Loading({ text }: { text: string }) {
  return <div className="grid min-h-dvh place-items-center text-sm text-ink-faint">{text}</div>;
}

// El visor 3D usa WebGL, así que solo se carga en el navegador.
const ProcessView = dynamic(() => import("./process-view"), {
  ssr: false,
  loading: () => <Loading text="Preparing the 3D viewer…" />,
});

type Step = { kind: "pick" } | { kind: "upload" } | { kind: "photos" | "process"; dataset: Dataset };

// Flujo de tres pasos: elegir las imágenes, verlas y mirar cómo se reconstruye el mundo 3D.
export function ReconstructionApp() {
  const [step, setStep] = useState<Step>({ kind: "pick" });
  // Con llaves: en Chrome scrollTo devuelve una promesa, y React la tomaría como función de limpieza.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [step.kind]);

  if (step.kind === "pick") {
    return (
      <DatasetPicker
        onPick={(dataset) => setStep({ kind: "photos", dataset })}
        onUpload={() => setStep({ kind: "upload" })}
      />
    );
  }
  if (step.kind === "upload") {
    return <UploadStep onBack={() => setStep({ kind: "pick" })} />;
  }
  const { dataset } = step;
  return (
    <Suspense fallback={<Loading text="Loading the photos…" />}>
      {step.kind === "photos" ? (
        <PhotoGallery
          dataset={dataset}
          onBack={() => setStep({ kind: "pick" })}
          onStart={() => setStep({ kind: "process", dataset })}
        />
      ) : (
        <ProcessView dataset={dataset} onBack={() => setStep({ kind: "photos", dataset })} />
      )}
    </Suspense>
  );
}
