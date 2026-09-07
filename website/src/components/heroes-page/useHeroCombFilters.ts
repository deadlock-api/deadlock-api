import { parseAsArrayOf, parseAsInteger, useQueryState } from "nuqs";

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
    setIncludeHeroIds(heroIds);
    setExcludeHeroIds((prev) => prev.filter((heroId) => !heroIds.includes(heroId)));
  };
  const setExcludeHeroes = (heroIds: number[]) => {
    setExcludeHeroIds(heroIds);
    setIncludeHeroIds((prev) => prev.filter((heroId) => !heroIds.includes(heroId)));
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
  };
}
