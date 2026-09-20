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
        onValueChange={(v) => setCombSize(Number(v))}
        active={combSize !== 2}
        onReset={() => setCombSize(2)}
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
        onValueChange={(v) => setCombsToShow(Number(v))}
        active={combsToShow !== HERO_COMBS_TO_SHOW[0]}
        onReset={() => setCombsToShow(HERO_COMBS_TO_SHOW[0])}
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
