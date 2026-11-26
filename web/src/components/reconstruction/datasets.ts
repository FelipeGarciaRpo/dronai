// Escenas que se pueden reconstruir paso a paso. Los archivos los genera el worker (ver worker/README.md).
export type Dataset = {
  id: string;
  title: string;
  place: string;
  description: string;
  sceneUrl: string;
  cover: string;
  source: { name: string; url: string; license: string };
  // true si la escena salió de un video: las poses las calculó DronAI con COLMAP.
  fromVideo?: boolean;
  // Con qué y dónde se entrenaron los splats publicados, si no fue con Brush en la laptop.
  trainedWith?: string;
};

const DNF = {
  name: "DroneDeploy NeRF Dataset",
  url: "https://github.com/nickponline/dd-nerf-dataset",
  license: "CC BY-NC-SA 4.0",
};

export const DATASETS: Dataset[] = [
  {
    id: "house1",
    title: "House with a pool",
    place: "California, USA",
    description: "220 photos from a DJI Phantom 4 drone on a mapping flight of about 10 minutes.",
    sceneUrl: "/scenes/house1/scene.json",
    cover: "/scenes/house1/thumbs/060.jpg",
    source: DNF,
  },
  {
    id: "pipes1",
    title: "Construction site with pipes",
    place: "British Columbia, Canada",
    description:
      "97 photos from a DJI Mavic 2 Pro over a construction site with pipes and valves: few photos, lots of detail.",
    sceneUrl: "/scenes/pipes1/scene.json",
    cover: "/scenes/pipes1/thumbs/030.jpg",
    source: DNF,
  },
  {
    id: "kallang",
    title: "Kallang Airport tower",
    place: "Singapore",
    description: "A 54 s drone video that circles the control tower. DronAI computed the camera poses with COLMAP.",
    sceneUrl: "/scenes/kallang/scene.json",
    cover: "/scenes/kallang/thumbs/057.jpg",
    source: {
      name: "Daniel Taka (Wikimedia Commons)",
      url: "https://commons.wikimedia.org/wiki/File:Kallang_Airport,_360_degree_view.webm",
      license: "CC BY 4.0",
    },
    fromVideo: true,
    trainedWith: "gsplat and NVIDIA's Difix3D+ on two Kaggle T4 GPUs",
  },
  {
    id: "abadia",
    title: "Jumièges Abbey",
    place: "Normandy, France",
    description: "An 85 s drone video that flies around the ruins. DronAI computed the camera poses with COLMAP.",
    sceneUrl: "/scenes/abadia/scene.json",
    cover: "/scenes/abadia/thumbs/036.jpg",
    source: {
      name: "Raimond Spekking (Wikimedia Commons)",
      url: "https://commons.wikimedia.org/wiki/File:Abbaye_de_Jumi%C3%A8ges_from_quadcopter.webm",
      license: "CC BY-SA 4.0",
    },
    fromVideo: true,
  },
  {
    id: "house3",
    title: "Brown-roof house",
    place: "Illinois, USA",
    description: "182 photos from a DJI Mavic Air: from overhead, at an angle and very close up.",
    sceneUrl: "/scenes/house3/scene.json",
    cover: "/scenes/house3/thumbs/130.jpg",
    source: DNF,
  },
];
