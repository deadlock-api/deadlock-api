import { HeroSelector } from "~/components/domain/selectors/HeroSelector";
import { Field } from "~/components/ui/field";
import { Segmented, SegmentedItem } from "~/components/ui/segmented";
import type { GameMode } from "~/lib/game-mode";

import { HERO_COMBS_TO_SHOW, useHeroCombFilters } from "./useHeroCombFilters";

/** The combination table's own controls, for its toolbar: size, how many to show, heroes to include or leave out. */
export function HeroCombFilters({ gameMode }: { gameMode?: GameMode }) {
  const { combSizes, combSize, setCombSize, combsToShow, setCombsToShow, heroSelections, setHeroSelections } =
    useHeroCombFilters(gameMode);

  return (
    <>
      <Field label="Combo size" orientation="horizontal">
        <Segmented value={String(combSize)} onValueChange={(v) => void setCombSize(Number(v))} width="hug">
          {combSizes.map((n) => (
            <SegmentedItem key={n} value={String(n)}>
              {String(n)}
            </SegmentedItem>
          ))}
        </Segmented>
      </Field>
      <Field label="Show" orientation="horizontal">
        <Segmented value={String(combsToShow)} onValueChange={(v) => void setCombsToShow(Number(v))} width="hug">
          {HERO_COMBS_TO_SHOW.map((n) => (
            <SegmentedItem key={n} value={String(n)}>
              {String(n)}
            </SegmentedItem>
          ))}
        </Segmented>
      </Field>
      <HeroSelector selection="tri-state" size="sm" value={heroSelections} onValueChange={setHeroSelections} />
    </>
  );
}
