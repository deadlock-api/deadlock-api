import type { MapImages } from "deadlock_api_client";

import type { MapArt } from "./map-era";

// The silhouette art only says where the streets are, so it gets the painted art's two greys: the heat palette was
// tuned against those. Canvas pixels cannot read CSS variables.
// ds-allow color-literal: canvas palette, the painted map's building grey
const SILHOUETTE_BASE = "#4b5058";
// ds-allow color-literal: canvas palette, the painted map's street grey
const SILHOUETTE_STREET = "#83868a";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.src = src;
  });
}

/**
 * The map as one square canvas the size of its largest layer, covering ±radius in world units: x to the right, y up.
 * Browser only.
 *
 * `painted` (builds before 6711): the background, the painted streets, then the frame multiplied in for its vignette.
 * `silhouette` (6711+): the streets are a black mask. The legacy background is a plain black disc under it and is not
 * drawn; the mask is filled with the street grey over a building-grey base instead, then the frame is multiplied in.
 */
export async function composeMap(images: MapImages, art: MapArt): Promise<HTMLCanvasElement> {
  const [background, mid, frame] = await Promise.all([
    art === "painted" ? loadImage(images.background) : null,
    loadImage(images.mid),
    loadImage(images.frame),
  ]);
  const size = Math.max(background?.naturalWidth ?? 0, mid.naturalWidth, frame.naturalWidth);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No 2D canvas context");

  if (background) {
    ctx.drawImage(background, 0, 0, size, size);
    ctx.drawImage(mid, 0, 0, size, size);
  } else {
    const streets = document.createElement("canvas");
    streets.width = size;
    streets.height = size;
    const streetsCtx = streets.getContext("2d");
    if (!streetsCtx) throw new Error("No 2D canvas context");
    streetsCtx.drawImage(mid, 0, 0, size, size);
    // Keeps the mask's shape and its soft edges, in the street color.
    streetsCtx.globalCompositeOperation = "source-in";
    streetsCtx.fillStyle = SILHOUETTE_STREET;
    streetsCtx.fillRect(0, 0, size, size);

    ctx.fillStyle = SILHOUETTE_BASE;
    ctx.fillRect(0, 0, size, size);
    // The mask is at most ~80% opaque; drawing it twice brings the streets close to their full grey.
    ctx.drawImage(streets, 0, 0);
    ctx.drawImage(streets, 0, 0);
  }
  ctx.globalCompositeOperation = "multiply";
  ctx.drawImage(frame, 0, 0, size, size);
  return canvas;
}
