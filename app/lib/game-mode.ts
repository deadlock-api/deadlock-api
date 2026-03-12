import type { GameMode } from "~/components/selectors/GameModeSelector";

export function isStreetBrawlMode(gameMode: GameMode | null | undefined): boolean {
  return gameMode === "street_brawl";
}

/**
 * Returns the effective rank range, disabling ranks for Street Brawl mode.
 */
export function getEffectiveRankRange(
  gameMode: GameMode | null | undefined,
  minRankId: number | null | undefined,
  maxRankId: number | null | undefined,
): { effectiveMinRankId: number | undefined; effectiveMaxRankId: number | undefined } {
  if (isStreetBrawlMode(gameMode)) {
    return { effectiveMinRankId: undefined, effectiveMaxRankId: undefined };
  }
  return {
    effectiveMinRankId: minRankId ?? undefined,
    effectiveMaxRankId: maxRankId ?? undefined,
  };
}
