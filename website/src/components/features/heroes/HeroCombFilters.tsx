import { HeroSelectorMultiple } from "~/components/domain/selectors/HeroSelector";
import { FilterToggleCell } from "~/components/patterns/filter-bar/FilterCell";
import { SegmentedItem } from "~/components/ui/segmented";

import { HERO_COMB_SIZES, HERO_COMBS_TO_SHOW, useHeroCombFilters } from "./useHeroCombFilters";

export function HeroCombFilters() {
  const {
    combSize,
    setCombSize,
    combsToShow,
    setCombsToShow,
    includeHeroIds,
    setIncludeHeroes,
    excludeHeroIds,
    setExcludeHeroes,
  } = useHeroCombFilters();

  return (
    <>
      <FilterToggleCell
        label="Combo size"
        value={String(combSize)}
        defaultValue="2"
        onValueChange={(v) => setCombSize(Number(v))}
      >
        {HERO_COMB_SIZES.map((n) => (
          <SegmentedItem key={n} value={String(n)}>
            {String(n)}
          </SegmentedItem>
        ))}
      </FilterToggleCell>
      <FilterToggleCell
        label="Show"
        value={String(combsToShow)}
        defaultValue={String(HERO_COMBS_TO_SHOW[0])}
        onValueChange={(v) => setCombsToShow(Number(v))}
      >
        {HERO_COMBS_TO_SHOW.map((n) => (
          <SegmentedItem key={n} value={String(n)}>
            {String(n)}
          </SegmentedItem>
        ))}
      </FilterToggleCell>
      <HeroSelectorMultiple label="Include" emptyLabel="Any" value={includeHeroIds} onValueChange={setIncludeHeroes} />
      <HeroSelectorMultiple label="Exclude" emptyLabel="None" value={excludeHeroIds} onValueChange={setExcludeHeroes} />
    </>
  );
}
