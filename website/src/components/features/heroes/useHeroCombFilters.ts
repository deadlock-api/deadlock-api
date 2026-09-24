import { parseAsArrayOf, parseAsInteger, useQueryState } from "nuqs";

import type { TriState } from "~/components/patterns/filter-bar/TriStateSelector";

export const HERO_COMB_SIZES = [2, 3, 4, 5, 6];
export const HERO_COMBS_TO_SHOW = [50, 100, 250, 500];

/** URL-backed state for the hero combinations tab, read by both the filter bar and the table. */
export function useHeroCombFilters(defaultCombsToShow = HERO_COMBS_TO_SHOW[0]) {
  const [combSize, setCombSize] = useQueryState("comb_size", parseAsInteger.withDefault(2));
  const [combsToShow, setCombsToShow] = useQueryState("combs_to_show", parseAsInteger.withDefault(defaultCombsToShow));
  const [includeHeroIds, setIncludeHeroIds] = useQueryState(
    "comb_include_heroes",
    parseAsArrayOf(parseAsInteger).withDefault([]),
  );
  const [excludeHeroIds, setExcludeHeroIds] = useQueryState(
    "comb_exclude_heroes",
    parseAsArrayOf(parseAsInteger).withDefault([]),
  );

  // A hero cannot be both required and forbidden; the newer choice wins.
  const setIncludeHeroes = (heroIds: number[]) => {
    void setIncludeHeroIds(heroIds);
    void setExcludeHeroIds((prev) => prev.filter((heroId) => !heroIds.includes(heroId)));
  };
  const setExcludeHeroes = (heroIds: number[]) => {
    void setExcludeHeroIds(heroIds);
    void setIncludeHeroIds((prev) => prev.filter((heroId) => !heroIds.includes(heroId)));
  };

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
    const largest = HERO_COMB_SIZES[HERO_COMB_SIZES.length - 1];
    if (included.length > combSize) void setCombSize(Math.min(included.length, largest));
  };

  return {
    combSize,
    setCombSize,
    combsToShow,
    setCombsToShow,
    includeHeroIds,
    setIncludeHeroes,
    excludeHeroIds,
    setExcludeHeroes,
    heroSelections,
    setHeroSelections,
  };
}
