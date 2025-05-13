export interface AssetsHero {
  id: number;
  name: string;
  in_development?: boolean;
  images: {
    minimap_image_webp: string;
    minimap_image: string;
  };
  colors: {
    ui: [number, number, number];
  };
}
