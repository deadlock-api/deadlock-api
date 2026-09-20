import { parseAsStringLiteral } from "nuqs";

const GAME_MODES = ["normal", "street_brawl"] as const;
export type GameMode = (typeof GAME_MODES)[number];

export const parseAsGameMode = parseAsStringLiteral(GAME_MODES).withDefault("normal");

/** The analytics endpoints take a comma separated `match_mode`; these are the values worth offering. */
const MATCH_MODES = ["ranked,unranked", "ranked", "unranked"] as const;
export type MatchMode = (typeof MATCH_MODES)[number];

export const DEFAULT_MATCH_MODE: MatchMode = "ranked,unranked";
export const parseAsMatchMode = parseAsStringLiteral(MATCH_MODES).withDefault(DEFAULT_MATCH_MODE);

/**
 * Game mode and match mode as one choice: Street Brawl is never played ranked, so the pairs
 * offered here are exactly the ones that can return data.
 */
export const MODE_CONFIG = {
  normal_all: {
    label: "All",
    gameMode: "normal",
    matchMode: "ranked,unranked",
    supportsRank: true,
  },
  normal_ranked: {
    label: "Ranked",
    gameMode: "normal",
    matchMode: "ranked",
    supportsRank: true,
  },
  normal_unranked: {
    label: "Unranked",
    gameMode: "normal",
    matchMode: "unranked",
    supportsRank: true,
  },
  street_brawl: {
    label: "Brawl",
    gameMode: "street_brawl",
    matchMode: "unranked",
    supportsRank: false,
  },
} satisfies Record<string, { label: string; gameMode: GameMode; matchMode: MatchMode; supportsRank: boolean }>;

export type Mode = keyof typeof MODE_CONFIG;

export const DEFAULT_MODE: Mode = "normal_all";

export function getEffectiveRankRange(
  mode: Mode,
  minRankId: number | null | undefined,
  maxRankId: number | null | undefined,
): { effectiveMinRankId: number | undefined; effectiveMaxRankId: number | undefined } {
  if (!MODE_CONFIG[mode].supportsRank) {
    return { effectiveMinRankId: undefined, effectiveMaxRankId: undefined };
  }
  return {
    effectiveMinRankId: minRankId ?? undefined,
    effectiveMaxRankId: maxRankId ?? undefined,
  };
}
