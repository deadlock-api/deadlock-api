import { GoogleFont, ImageResponse } from "@cf-wasm/og";

import { CARD_HEIGHT, CARD_WIDTH, cardHeaders, LOGO } from "./card-kit";
import { inlineImage } from "./inline-image";
import { MatchCard } from "./match-card";
import { type MatchCardData, loadMatchCardData } from "./match-card-data";

/** Cache lifetimes in seconds: a stored match never changes; a missing one may be sent in, or the API was down. */
const CARD_AGE = 30 * 24 * 60 * 60;
const RETRY_AGE = 5 * 60;

const FONTS = ([700, 800] as const).map((weight) => new GoogleFont("Inter", { weight }));

/** The card's data with every image already loaded: portraits and badges repeat across cards, so they are kept. */
async function withInlineImages(data: MatchCardData): Promise<MatchCardData> {
  const inlineTeam = async (team: MatchCardData["teams"][number]) => ({
    ...team,
    heroes: await Promise.all(team.heroes.map(async (hero) => ({ ...hero, src: await inlineImage(hero.src) }))),
  });
  const [logo, rankImage, first, second] = await Promise.all([
    inlineImage(LOGO),
    inlineImage(data.rankImage),
    inlineTeam(data.teams[0]),
    inlineTeam(data.teams[1]),
  ]);
  return { ...data, logo, rankImage, teams: [first, second] };
}

/** The PNG share card of a match (`id`), or a card naming the match only when we do not have it. */
export async function renderMatchCard(search: URLSearchParams): Promise<Response> {
  const matchId = Number(search.get("id"));
  const valid = Number.isSafeInteger(matchId) && matchId > 0;
  const loaded = valid ? await loadMatchCardData(matchId).catch(() => null) : null;
  const data = loaded && (await withInlineImages(loaded));
  return ImageResponse.async(<MatchCard matchId={valid ? matchId : 0} data={data} logo={data?.logo} />, {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    fonts: FONTS,
    headers: cardHeaders(data ? CARD_AGE : RETRY_AGE),
  });
}
