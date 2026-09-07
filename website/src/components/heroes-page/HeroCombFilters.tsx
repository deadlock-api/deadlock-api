import { FilterToggleCell } from "~/components/Filter/FilterCell";
import { HeroSelectorMultiple } from "~/components/selectors/HeroSelector";

import { HERO_COMB_SIZES, HERO_COMBS_TO_SHOW, useHeroCombFilters } from "./useHeroCombFilters";

const SIZE_OPTIONS = HERO_COMB_SIZES.map((n) => ({ value: String(n), label: String(n) }));
const SHOW_OPTIONS = HERO_COMBS_TO_SHOW.map((n) => ({ value: String(n), label: String(n) }));

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
        options={SIZE_OPTIONS}
        active={combSize !== 2}
      />
      <FilterToggleCell
        label="Show"
        value={String(combsToShow)}
        onValueChange={(v) => setCombsToShow(Number(v))}
        options={SHOW_OPTIONS}
        active={combsToShow !== HERO_COMBS_TO_SHOW[0]}
      />
      <HeroSelectorMultiple
        label="Include"
        emptyLabel="Any"
        selectedHeroes={includeHeroIds}
        onHeroesSelected={setIncludeHeroes}
      />
      <HeroSelectorMultiple
        label="Exclude"
        emptyLabel="None"
        selectedHeroes={excludeHeroIds}
        onHeroesSelected={setExcludeHeroes}
      />
    </>
  );
}
