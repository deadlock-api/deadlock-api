import { parseAsArrayOf, parseAsInteger, useQueryState } from "nuqs";

import type { TriState } from "~/components/patterns/filter-bar/TriStateSelector";
import { getPickrateMultiplier } from "~/lib/constants";
import type { GameMode } from "~/lib/game-mode";

const HERO_COMB_SIZES = [2, 3, 4, 5, 6];
export const HERO_COMBS_TO_SHOW = [50, 100, 250, 500];

/**
 * URL-backed state for the hero combinations tab, read by both the filter bar and the table. A combination is part of
 * one team, so the sizes stop at the mode's team size (4 in Street Brawl), and a larger size from the URL reads as it.
 */
export function useHeroCombFilters(gameMode?: GameMode, defaultCombsToShow = HERO_COMBS_TO_SHOW[0]) {
  const combSizes = HERO_COMB_SIZES.filter((size) => size <= getPickrateMultiplier(gameMode) / 2);
  const largest = combSizes[combSizes.length - 1];
  const [chosenCombSize, setCombSize] = useQueryState("comb_size", parseAsInteger.withDefault(2));
  const combSize = Math.min(chosenCombSize, largest);
  const [combsToShow, setCombsToShow] = useQueryState("combs_to_show", parseAsInteger.withDefault(defaultCombsToShow));
  const [includeHeroIds, setIncludeHeroIds] = useQueryState(
    "comb_include_heroes",
    parseAsArrayOf(parseAsInteger).withDefault([]),
  );
  const [excludeHeroIds, setExcludeHeroIds] = useQueryState(
    "comb_exclude_heroes",
    parseAsArrayOf(parseAsInteger).withDefault([]),
  );

  const heroSelections = new Map<number, TriState>([
    ...includeHeroIds.map((heroId): [number, TriState] => [heroId, "included"]),
    ...excludeHeroIds.map((heroId): [number, TriState] => [heroId, "excluded"]),
  ]);
  // One control for both lists. A combination holds at least every included hero, so including a third hero with a
  // size of 2 raises the size to 3 instead of leaving an empty table.
  const setHeroSelections = (next: Map<number, TriState>) => {
    const included = [...next].filter(([, state]) => state === "included").map(([heroId]) => heroId);
    const excluded = [...next].filter(([, state]) => state === "excluded").map(([heroId]) => heroId);
    void setIncludeHeroIds(included);
    void setExcludeHeroIds(excluded);
    if (included.length > combSize) void setCombSize(Math.min(included.length, largest));
  };

  return {
    combSizes,
    combSize,
    setCombSize,
    combsToShow,
    setCombsToShow,
    includeHeroIds,
    excludeHeroIds,
    heroSelections,
    setHeroSelections,
  };
}
