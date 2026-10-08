import { GoogleFont, ImageResponse, type ImageResponseOptions } from "@cf-wasm/og";

import { CARD_HEIGHT, CARD_WIDTH, cardHeaders, LOGO } from "./card-kit";
import { CompareCard } from "./compare-card";
import { type CompareCardData, loadCompareCardData } from "./compare-card-data";
import { inlineImage } from "./inline-image";
import { ComparePromoCard } from "./promo-card";

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
  // promo card standing in for players whose data failed to load, or a card missing a rank or a name, is only kept
  // until the API is likely back.
  const failed = (players && !data) || data?.partial;
  const draw = (element: React.ReactElement, extraFonts: boolean, maxAge = failed ? RETRY_AGE : CARD_AGE) =>
    ImageResponse.async(element, {
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      fonts: FONTS,
      headers: cardHeaders(maxAge),
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
