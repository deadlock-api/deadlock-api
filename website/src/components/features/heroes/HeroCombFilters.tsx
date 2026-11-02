import { HeroSelector } from "~/components/domain/selectors/HeroSelector";
import { FilterToggleCell } from "~/components/patterns/filter-bar/FilterCell";
import { SegmentedItem } from "~/components/ui/segmented";
import type { GameMode } from "~/lib/game-mode";

import { HERO_COMBS_TO_SHOW, useHeroCombFilters } from "./useHeroCombFilters";

/** The combination table's own controls, for the page's filter row: size, how many to show, heroes to include or leave out. */
export function HeroCombFilters({ gameMode }: { gameMode?: GameMode }) {
  const { combSizes, combSize, setCombSize, combsToShow, setCombsToShow, heroSelections, setHeroSelections } =
    useHeroCombFilters(gameMode);

  return (
    <>
      <FilterToggleCell label="Combo size" value={String(combSize)} onValueChange={(v) => void setCombSize(Number(v))}>
        {combSizes.map((n) => (
          <SegmentedItem key={n} value={String(n)}>
            {String(n)}
          </SegmentedItem>
        ))}
      </FilterToggleCell>
      <FilterToggleCell label="Show" value={String(combsToShow)} onValueChange={(v) => void setCombsToShow(Number(v))}>
        {HERO_COMBS_TO_SHOW.map((n) => (
          <SegmentedItem key={n} value={String(n)}>
            {String(n)}
          </SegmentedItem>
        ))}
      </FilterToggleCell>
      <HeroSelector selection="tri-state" size="sm" value={heroSelections} onValueChange={setHeroSelections} />
    </>
  );
}
