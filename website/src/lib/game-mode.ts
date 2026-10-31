import { parseAsStringLiteral } from "nuqs";

import { DEFAULT_RANK_RANGE, MAX_BADGE } from "~/lib/rank-utils";

const GAME_MODES = ["normal", "street_brawl"] as const;
export type GameMode = (typeof GAME_MODES)[number];

export const parseAsGameMode = parseAsStringLiteral(GAME_MODES).withDefault("normal");

/** The analytics endpoints take a comma separated `match_mode`; these are the values worth offering. */
export const MATCH_MODES = ["ranked,unranked", "ranked", "unranked"] as const;
export type MatchMode = (typeof MATCH_MODES)[number];

export const DEFAULT_MATCH_MODE: MatchMode = "ranked";
export const parseAsMatchMode = parseAsStringLiteral(MATCH_MODES).withDefault(DEFAULT_MATCH_MODE);
/** The tracker's `match_mode`: its default is All, ranked and unranked together. */
export const parseAsTrackerMatchMode = parseAsStringLiteral(MATCH_MODES).withDefault("ranked,unranked");

/**
 * Game mode and match mode as one choice: Street Brawl is never played ranked, so the pairs
 * offered here are exactly the ones that can return data. `supportsRank` says whether a rank range
 * can narrow the mode; where it cannot, the rank filter is hidden and dropped from requests.
 * `hasRankedMatches` says whether the mode holds any matches with a rank, so a breakdown by rank has
 * something to show. A rank cohort set against a player's matches needs `supportsRank`: in All it
 * would drop the unranked matches the player's side keeps.
 *
 * Only ranked lobbies carry an average badge: any rank bound drops every unranked match. A range is
 * therefore offered in Ranked alone, and All stays all of ranked and unranked.
 */
export const MODE_CONFIG = {
  normal_all: {
    label: "All",
    gameMode: "normal",
    matchMode: "ranked,unranked",
    supportsRank: false,
    hasRankedMatches: true,
  },
  normal_ranked: {
    label: "Ranked",
    gameMode: "normal",
    matchMode: "ranked",
    supportsRank: true,
    hasRankedMatches: true,
  },
  normal_unranked: {
    label: "Unranked",
    gameMode: "normal",
    matchMode: "unranked",
    supportsRank: false,
    hasRankedMatches: false,
  },
  street_brawl: {
    label: "Brawl",
    gameMode: "street_brawl",
    matchMode: "unranked",
    supportsRank: false,
    hasRankedMatches: false,
  },
} satisfies Record<
  string,
  { label: string; gameMode: GameMode; matchMode: MatchMode; supportsRank: boolean; hasRankedMatches: boolean }
>;

export type Mode = keyof typeof MODE_CONFIG;

export const MODES = Object.keys(MODE_CONFIG) as Mode[];
/**
 * The modes the analytics pages offer. All is left out: it mixes lobbies a rank range cannot narrow with ones it can,
 * and the stats read cleaner one mode at a time. A player's own matches (the tracker) still offer All.
 */
export const ANALYTICS_MODES = ["normal_ranked", "normal_unranked", "street_brawl"] as const satisfies readonly Mode[];
export type AnalyticsMode = (typeof ANALYTICS_MODES)[number];
/** The analytics pages start in Ranked, where the rank range applies. */
export const DEFAULT_MODE: AnalyticsMode = "normal_ranked";

/** An analytics page's reading of a mode from the URL: an old link to All opens in the default mode. */
export function analyticsMode(mode: Mode): AnalyticsMode {
  return mode === "normal_all" ? DEFAULT_MODE : mode;
}

/** A player's own match history starts in All, so a player who plays unranked does not land on an empty tracker. */
export const TRACKER_DEFAULT_MODE: Mode = "normal_all";

const NORMAL_MODE_BY_MATCH_MODE: Record<MatchMode, Mode> = {
  "ranked,unranked": "normal_all",
  ranked: "normal_ranked",
  unranked: "normal_unranked",
};

/** The one Mode the long-standing `game_mode` / `match_mode` search params stand for. */
export function modeFromParams(gameMode: GameMode, matchMode: MatchMode): Mode {
  return gameMode === "street_brawl" ? "street_brawl" : NORMAL_MODE_BY_MATCH_MODE[matchMode];
}

export function getEffectiveRankRange(
  mode: Mode,
  minRankId: number | null | undefined,
  maxRankId: number | null | undefined,
): { effectiveMinRankId: number | undefined; effectiveMaxRankId: number | undefined } {
  if (!MODE_CONFIG[mode].supportsRank) {
    return { effectiveMinRankId: undefined, effectiveMaxRankId: undefined };
  }
  // A hand-edited URL can carry the pair backwards; the API answers that with nothing at all.
  if (minRankId != null && maxRankId != null && minRankId > maxRankId) {
    return { effectiveMinRankId: maxRankId, effectiveMaxRankId: minRankId };
  }
  return {
    effectiveMinRankId: minRankId ?? undefined,
    effectiveMaxRankId: maxRankId ?? undefined,
  };
}

/**
 * The average badge bounds a page asks for on its defaults: the default mode and the page's own default rank range.
 * Server prefetches spread this so their query keys match the page's first request.
 */
function defaultBadges(minRankId: number, maxRankId: number) {
  const { effectiveMinRankId, effectiveMaxRankId } = getEffectiveRankRange(DEFAULT_MODE, minRankId, maxRankId);
  return { minAverageBadge: effectiveMinRankId, maxAverageBadge: effectiveMaxRankId };
}

/** The bounds of the hero, item and build pages, which default to Phantom 1+. */
export const DEFAULT_BADGES = defaultBadges(DEFAULT_RANK_RANGE.min, DEFAULT_RANK_RANGE.max);

/** The bounds of the game, player and ability pages, which default to every rank. */
export const ALL_RANKS_BADGES = defaultBadges(0, MAX_BADGE);

/**
 * Street Brawl hands out fixed souls each round instead of a soul economy, so net worth, souls per minute and soul
 * sources say nothing about a player there. Pages hide those metrics for it; normal mode shows them.
 */
export function hasSoulEconomy(gameMode: GameMode | (string & {}) | null | undefined): boolean {
  return gameMode !== "street_brawl";
}
