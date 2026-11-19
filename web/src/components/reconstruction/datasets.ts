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
    title: "Casa con piscina",
    place: "California, EE. UU.",
    description: "220 fotos de un dron DJI Phantom 4 en un vuelo de mapeo de unos 10 minutos.",
    sceneUrl: "/scenes/house1/scene.json",
    cover: "/scenes/house1/thumbs/060.jpg",
    source: DNF,
  },
  {
    id: "pipes1",
    title: "Obra con tuberías",
    place: "Columbia Británica, Canadá",
    description: "97 fotos de un DJI Mavic 2 Pro sobre una obra con tuberías y válvulas: pocas fotos, mucho detalle.",
    sceneUrl: "/scenes/pipes1/scene.json",
    cover: "/scenes/pipes1/thumbs/030.jpg",
    source: DNF,
  },
  {
    id: "kallang",
    title: "Torre del aeropuerto de Kallang",
    place: "Singapur",
    description:
      "Un video de dron de 54 s que rodea la torre de control. Las posiciones de la cámara las calculó DronAI con COLMAP.",
    sceneUrl: "/scenes/kallang/scene.json",
    cover: "/scenes/kallang/thumbs/057.jpg",
    source: {
      name: "Daniel Taka (Wikimedia Commons)",
      url: "https://commons.wikimedia.org/wiki/File:Kallang_Airport,_360_degree_view.webm",
      license: "CC BY 4.0",
    },
    fromVideo: true,
    trainedWith: "gsplat y Difix3D+ de NVIDIA, en dos GPU T4 de Kaggle",
  },
  {
    id: "abadia",
    title: "Abadía de Jumièges",
    place: "Normandía, Francia",
    description:
      "Un video de dron de 85 s que vuela alrededor de las ruinas. Las posiciones de la cámara las calculó DronAI con COLMAP.",
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
    title: "Casa de techo marrón",
    place: "Illinois, EE. UU.",
    description: "182 fotos de un DJI Mavic Air, desde arriba, en diagonal y muy de cerca.",
    sceneUrl: "/scenes/house3/scene.json",
    cover: "/scenes/house3/thumbs/130.jpg",
    source: DNF,
  },
];
