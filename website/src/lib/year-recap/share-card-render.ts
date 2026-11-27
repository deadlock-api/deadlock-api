import {
  drawShareCard,
  SHARE_FORMATS,
  type ShareCardData,
  type ShareCardFonts,
  type ShareCardPalette,
  shareCardLayout,
  type ShareFormat,
} from "./share-card";

// Browser only: makes the share PNG on a canvas. Call it from an event or a query, never during render.

/** The pictures on the card; a host that does not allow CORS (or fails) leaves its picture out. */
export interface ShareCardSources {
  avatar?: string | null;
  hero?: string | null;
  badge?: string | null;
}

export interface RenderedShareCard {
  blob: Blob;
  /** The same PNG as a data URL, for the preview `<img>`: nothing to revoke when the preview goes. */
  url: string;
}

/**
 * The picture at `url` as a bitmap, or null. Fetched with CORS rather than through an `<img>`: a picture from a host
 * that does not allow it can never reach the canvas and taint it, and one the page already showed without CORS is not
 * reused from the image cache.
 */
export async function loadShareImage(url: string | null | undefined): Promise<ImageBitmap | null> {
  if (!url) return null;
  try {
    const response = await fetch(url, { mode: "cors", credentials: "omit" });
    if (!response.ok) return null;
    return await createImageBitmap(await response.blob());
  } catch {
    return null;
  }
}

/** A color token as `#rrggbb`, the form `withAlpha` can fade: the canvas parses whatever CSS color the token holds. */
function normalizeColor(ctx: CanvasRenderingContext2D, value: string, fallback: string): string {
  ctx.fillStyle = fallback;
  if (value) ctx.fillStyle = value;
  return typeof ctx.fillStyle === "string" ? ctx.fillStyle : fallback;
}

/** The card's colors and faces, read from the design tokens on the root element. */
function readTheme(ctx: CanvasRenderingContext2D): { palette: ShareCardPalette; fonts: ShareCardFonts } {
  // A fresh context's own fill (opaque black) stands in for a token that is missing or does not parse.
  const initial = typeof ctx.fillStyle === "string" ? ctx.fillStyle : "black";
  const style = getComputedStyle(document.documentElement);
  const token = (name: string) => style.getPropertyValue(`--${name}`).trim();
  const color = (name: string) => normalizeColor(ctx, token(name), initial);
  return {
    palette: {
      background: color("background"),
      surface: color("card"),
      border: color("border"),
      foreground: color("foreground"),
      muted: color("muted-foreground"),
      primary: color("primary"),
    },
    fonts: {
      display: token("font-display") || "sans-serif",
      sans: token("font-sans") || "sans-serif",
    },
  };
}

/** Loads the weights the card uses; the page may not have needed them yet. */
async function loadFonts(fonts: ShareCardFonts) {
  const faces = [
    `700 100px ${fonts.display}`,
    `600 100px ${fonts.display}`,
    `500 40px ${fonts.sans}`,
    `600 40px ${fonts.sans}`,
  ];
  await Promise.all(faces.map((face) => document.fonts.load(face).catch(() => [])));
  await document.fonts.ready;
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("The image could not be encoded"))), "image/png");
  });
}

function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("The image could not be read"));
    reader.onerror = () => reject(reader.error ?? new Error("The image could not be read"));
    reader.readAsDataURL(blob);
  });
}

/** Paints the card of `format` and encodes it as a PNG. */
export async function renderShareCard({
  format,
  data,
  sources,
}: {
  format: ShareFormat;
  data: ShareCardData;
  sources: ShareCardSources;
}): Promise<RenderedShareCard> {
  const { width, height } = SHARE_FORMATS[format];
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser cannot draw on a canvas");
  const theme = readTheme(ctx);
  const [avatar, hero, badge] = await Promise.all([
    loadShareImage(sources.avatar),
    loadShareImage(sources.hero),
    loadShareImage(sources.badge),
    loadFonts(theme.fonts),
  ]);
  drawShareCard(ctx, shareCardLayout(format), data, { avatar, hero, badge }, theme.palette, theme.fonts);
  for (const bitmap of [avatar, hero, badge]) bitmap?.close();
  const blob = await toBlob(canvas);
  return { blob, url: await toDataUrl(blob) };
}
