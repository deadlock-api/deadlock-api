import { GoogleFont, ImageResponse } from "@cf-wasm/og";

import { API_ORIGIN } from "~/lib/constants";
import { type CrosshairRenderSettings, renderCrosshair } from "~/lib/crosshair-render";

// Bundled as data URIs: the Worker cannot fetch the site's own public files from its own domain.
import logo from "../../../public/favicon.png?inline";
import background from "../../../public/streamkit/deadlock-background.png?inline";
import { CARD_HEIGHT, CARD_WIDTH, cardHeaders } from "./card-kit";
import { CrosshairCard, type CrosshairPixels, type PixelRun } from "./crosshair-card";

/** How large the crosshair may be drawn on the card, in pixels. */
const CROSSHAIR_SIZE = 360;
const MAX_SCALE = 16;
const SCREEN_HEIGHTS = new Set(["1080", "1440", "2160"]);

/** Cache lifetimes in seconds: a drawn card (a code always draws the same), and a card drawn without its crosshair. */
const CARD_AGE = 7 * 24 * 60 * 60;
const RETRY_AGE = 5 * 60;

const FONTS = ([700, 800] as const).map((weight) => new GoogleFont("Inter", { weight }));

/**
 * The crosshair of a code as rows of same-coloured pixel runs, enlarged by the largest whole scale that fits the card.
 * It is drawn as rectangles rather than an image, since the card's renderer smooths every image it draws, which would
 * blur the crosshair's square pixels. The pixels come from the site's renderer, the same as the API's.
 */
async function loadCrosshair(code: string, screenHeight: string): Promise<CrosshairPixels | undefined> {
  const response = await fetch(`${API_ORIGIN}/v1/crosshair/code/settings?${new URLSearchParams({ code })}`);
  if (!response.ok) return undefined;
  const image = renderCrosshair((await response.json()) as CrosshairRenderSettings, Number(screenHeight));
  if (!image) return undefined;
  const scale = Math.max(1, Math.min(MAX_SCALE, Math.floor(CROSSHAIR_SIZE / image.size)));
  const { pixels } = image;
  const samePixel = (i: number, j: number) =>
    pixels[i] === pixels[j] &&
    pixels[i + 1] === pixels[j + 1] &&
    pixels[i + 2] === pixels[j + 2] &&
    pixels[i + 3] === pixels[j + 3];
  const runs: PixelRun[] = [];
  for (let y = 0; y < image.size; y++) {
    let x = 0;
    while (x < image.size) {
      const at = (y * image.size + x) * 4;
      let length = 1;
      while (x + length < image.size && samePixel(at + length * 4, at)) length++;
      const [r, g, b, a] = pixels.subarray(at, at + 4);
      if (a) runs.push({ x, y, length, color: `rgba(${r},${g},${b},${a / 255})` });
      x += length;
    }
  }
  return { size: image.size, scale, runs };
}

/** The PNG share card of a crosshair code (`code`, `res`), or the editor's card when the code does not draw. */
export async function renderCrosshairCard(search: URLSearchParams): Promise<Response> {
  const code = search.get("code")?.trim() ?? "";
  const res = search.get("res") ?? "";
  const screenHeight = SCREEN_HEIGHTS.has(res) ? res : "1080";
  const crosshair = code ? await loadCrosshair(code, screenHeight).catch(() => undefined) : undefined;
  const maxAge = code && !crosshair ? RETRY_AGE : CARD_AGE;
  return ImageResponse.async(<CrosshairCard background={background} logo={logo} crosshair={crosshair} />, {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    fonts: FONTS,
    headers: cardHeaders(maxAge),
  });
}
