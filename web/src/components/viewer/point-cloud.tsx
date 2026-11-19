"use client";

import { useLoader } from "@react-three/fiber";
import { PLYLoader } from "three/addons/loaders/PLYLoader.js";

// Además de posición y color se lee la propiedad "view" (la foto que ve cada punto más de cerca), si existe.
// Todas las vistas cargan la nube con esta misma configuración porque useLoader guarda la geometría por URL.
function readViews(loader: PLYLoader) {
  loader.setCustomPropertyNameMapping({ view: ["view"] });
}

export function usePointCloudGeometry(url: string) {
  return useLoader(PLYLoader, url, readViews);
}

// Nube de puntos con color (PLY con x, y, z y red, green, blue).
export function PointCloud({ url, size }: { url: string; size: number }) {
  const geometry = usePointCloudGeometry(url);
  return (
    <points geometry={geometry}>
      <pointsMaterial vertexColors size={size} sizeAttenuation />
    </points>
  );
}
