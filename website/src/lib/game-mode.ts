import { parseAsStringLiteral } from "nuqs";

import { DEFAULT_RANK_RANGE } from "~/lib/rank-utils";

const GAME_MODES = ["normal", "street_brawl"] as const;
export type GameMode = (typeof GAME_MODES)[number];

export const parseAsGameMode = parseAsStringLiteral(GAME_MODES).withDefault("normal");

/** The analytics endpoints take a comma separated `match_mode`; these are the values worth offering. */
export const MATCH_MODES = ["ranked,unranked", "ranked", "unranked"] as const;
export type MatchMode = (typeof MATCH_MODES)[number];

export const DEFAULT_MATCH_MODE: MatchMode = "ranked,unranked";
export const parseAsMatchMode = parseAsStringLiteral(MATCH_MODES).withDefault(DEFAULT_MATCH_MODE);

/**
 * Game mode and match mode as one choice: Street Brawl is never played ranked, so the pairs
 * offered here are exactly the ones that can return data. `supportsRank` says whether a rank range
 * can narrow the mode; where it cannot, the rank filter is hidden and dropped from requests.
 * `hasRankedMatches` says whether the mode holds any matches with a rank, so a breakdown by rank or
 * a rank cohort has something to show.
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

export const DEFAULT_MODE: Mode = "normal_all";

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
 * The average badge bounds of a page's defaults (mode All, rank range Phantom 1+), as the pages put them into their
 * requests: none, since All has no rank range. Server prefetches spread this so their query keys match.
 */
export const DEFAULT_BADGES = (() => {
  const { effectiveMinRankId, effectiveMaxRankId } = getEffectiveRankRange(
    DEFAULT_MODE,
    DEFAULT_RANK_RANGE.min,
    DEFAULT_RANK_RANGE.max,
  );
  return { minAverageBadge: effectiveMinRankId, maxAverageBadge: effectiveMaxRankId };
})();

/**
 * Street Brawl hands out fixed souls each round instead of a soul economy, so net worth, souls per minute and soul
 * sources say nothing about a player there. Pages hide those metrics for it; normal mode shows them.
 */
export function hasSoulEconomy(gameMode: GameMode | (string & {}) | null | undefined): boolean {
  return gameMode !== "street_brawl";
}
