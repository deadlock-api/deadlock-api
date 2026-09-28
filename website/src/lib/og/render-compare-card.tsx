import { GoogleFont, ImageResponse, type ImageResponseOptions } from "@cf-wasm/og";

import { CARD_HEIGHT, CARD_WIDTH, LOGO } from "./card-kit";
import { CompareCard } from "./compare-card";
import { type CompareCardData, loadCompareCardData } from "./compare-card-data";
import { ComparePromoCard } from "./promo-card";

/**
 * Images as data URIs, kept for the life of the isolate: rank badges and the logo repeat on every card. Avatars are
 * loaded per card and not kept, since the edge cache already answers a repeated card. Handing satori data URIs also
 * spares it its own fetches.
 */
const IMAGE_CACHE = new Map<string, Promise<string | undefined>>();
const IMAGE_CACHE_SIZE = 300;

async function fetchDataUri(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(String(response.status));
  const type = response.headers.get("content-type") ?? "image/png";
  return `data:${type};base64,${Buffer.from(await response.arrayBuffer()).toString("base64")}`;
}

function inlineImage(url: string | undefined, keep = true): Promise<string | undefined> {
  if (!url) return Promise.resolve(undefined);
  if (!keep) return fetchDataUri(url).catch(() => undefined);
  const hit = IMAGE_CACHE.get(url);
  if (hit) return hit;
  // Oldest out first; a Map iterates in insertion order.
  if (IMAGE_CACHE.size >= IMAGE_CACHE_SIZE) IMAGE_CACHE.delete(IMAGE_CACHE.keys().next().value!);
  const load = fetchDataUri(url).catch(() => {
    // A failed image is not remembered: the next card tries again, this one draws its fallback.
    IMAGE_CACHE.delete(url);
    return undefined;
  });
  IMAGE_CACHE.set(url, load);
  return load;
}

/** The card's data with every image already loaded, all at once. */
async function withInlineImages(data: CompareCardData): Promise<CompareCardData> {
  const [logo, players] = await Promise.all([
    inlineImage(LOGO),
    Promise.all(
      data.players.map(async (player) => {
        const [avatar, rankImage] = await Promise.all([
          inlineImage(player.avatar, false),
          inlineImage(player.rankImage),
        ]);
        return { ...player, avatar, rankImage };
      }),
    ),
  ]);
  return { ...data, logo, players };
}

/** Loads emoji only: a script satori cannot shape draws nothing instead of failing the image. */
const skipScriptFonts: ImageResponseOptions["loadAdditionalAsset"] = (code, _segment, next) =>
  code === "emoji" ? next() : [];

/** Cache lifetimes in seconds: a drawn card, and a stand-in drawn because something failed. */
const CARD_AGE = 7 * 24 * 60 * 60;
const RETRY_AGE = 5 * 60;

/** Inter in the weights the card uses; names in other scripts and emoji load their own fonts on demand. */

const FONTS = ([400, 600, 700, 800, 900] as const).map((weight) => new GoogleFont("Inter", { weight }));

/**
 * The PNG of a comparison for its search params, or the page's promo card without players. A failed data load draws
 * the promo card too: an unfurl must never be a broken image.
 */
export async function renderCompareCard(search: URLSearchParams): Promise<Response> {
  const players = search.get("players");
  const loaded = players ? await loadCompareCardData(search).catch(() => null) : null;
  const data = loaded && (await withInlineImages(loaded));
  const card = data ? <CompareCard data={data} /> : <ComparePromoCard logo={await inlineImage(LOGO)} />;
  // A shared link pins its dates, so its card stays true: a week, so a link posted again unfurls from cache at once. A
  // promo card standing in for players whose data failed to load is only kept until the API is likely back.
  const draw = (element: React.ReactElement, extraFonts: boolean, maxAge = players && !data ? RETRY_AGE : CARD_AGE) =>
    ImageResponse.async(element, {
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      fonts: FONTS,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": import.meta.env.DEV ? "no-store" : `public, max-age=${maxAge}, s-maxage=${maxAge}`,
      },
      // Without extra fonts, a script satori cannot shape (Arabic fails in its font parser) draws nothing instead of
      // failing the whole image. Emoji still load.
      ...(extraFonts
        ? {}
        : {
            loadAdditionalAsset: skipScriptFonts,
          }),
    });
  // An unfurl must never be a broken image: the card, then the card without other scripts' fonts, then the promo card.
  try {
    return await draw(card, true);
  } catch (error) {
    console.error("compare card: render failed, retrying without script fonts", error);
    try {
      return await draw(card, false);
    } catch (retryError) {
      console.error("compare card: render failed again, serving the promo card", retryError);
      return draw(<ComparePromoCard logo={data?.logo} />, false, RETRY_AGE);
    }
  }
}
