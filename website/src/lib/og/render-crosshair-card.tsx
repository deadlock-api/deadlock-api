import { GoogleFont, ImageResponse } from "@cf-wasm/og";

import { API_ORIGIN } from "~/lib/constants";

import { CARD_HEIGHT, CARD_WIDTH, LOGO } from "./card-kit";
import { CrosshairCard, type CrosshairCardImage } from "./crosshair-card";
import { fetchDataUri, inlineImage } from "./inline-image";

/** The scene the editor previews crosshairs on by default. */
const BACKGROUND = "https://deadlock-api.com/streamkit/deadlock-background.png";
/** How tall the crosshair may be drawn on the card, in pixels. */
const CROSSHAIR_SIZE = 360;
/** The largest enlargement the API draws. */
const MAX_SCALE = 16;
const SCREEN_HEIGHTS = new Set(["1080", "1440", "2160"]);

/** Cache lifetimes in seconds: a drawn card (a code always draws the same), and a card drawn without its crosshair. */
const CARD_AGE = 7 * 24 * 60 * 60;
const RETRY_AGE = 5 * 60;

const FONTS = ([700, 800] as const).map((weight) => new GoogleFont("Inter", { weight }));

function imageUrl(code: string, screenHeight: string, scale: number): string {
  return `${API_ORIGIN}/v1/crosshair/code/image?${new URLSearchParams({ code, screen_height: screenHeight, scale: String(scale) })}`;
}

/** The width of a PNG, from its header. */
function pngWidth(bytes: ArrayBuffer): number {
  return new DataView(bytes).getUint32(16);
}

/**
 * The crosshair enlarged by the largest whole scale that fits the card, so every pixel stays a crisp square: satori
 * would smooth an image it has to scale itself.
 */
async function loadCrosshair(code: string, screenHeight: string): Promise<CrosshairCardImage | undefined> {
  const trueSize = await fetch(imageUrl(code, screenHeight, 1));
  if (!trueSize.ok) return undefined;
  const width = pngWidth(await trueSize.arrayBuffer());
  const scale = Math.max(1, Math.min(MAX_SCALE, Math.floor(CROSSHAIR_SIZE / width)));
  const src = await fetchDataUri(imageUrl(code, screenHeight, scale));
  return { src, width: width * scale, height: width * scale };
}

/** The PNG share card of a crosshair code (`code`, `res`), or the editor's card when the code does not draw. */
export async function renderCrosshairCard(search: URLSearchParams): Promise<Response> {
  const code = search.get("code")?.trim() ?? "";
  const res = search.get("res") ?? "";
  const screenHeight = SCREEN_HEIGHTS.has(res) ? res : "1080";
  const [background, logo, crosshair] = await Promise.all([
    inlineImage(BACKGROUND),
    inlineImage(LOGO),
    code ? loadCrosshair(code, screenHeight).catch(() => undefined) : undefined,
  ]);
  const maxAge = code && !crosshair ? RETRY_AGE : CARD_AGE;
  return ImageResponse.async(<CrosshairCard background={background} logo={logo} crosshair={crosshair} />, {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    fonts: FONTS,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": import.meta.env.DEV ? "no-store" : `public, max-age=${maxAge}, s-maxage=${maxAge}`,
    },
  });
}
