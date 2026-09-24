import { HeroSelectorMultiple } from "~/components/domain/selectors/HeroSelector";
import { Field } from "~/components/ui/field";
import { Segmented, SegmentedItem } from "~/components/ui/segmented";

import { HERO_COMB_SIZES, HERO_COMBS_TO_SHOW, useHeroCombFilters } from "./useHeroCombFilters";

/** The combination table's own controls, for its toolbar: size, how many to show, heroes to include or leave out. */
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
      <Field label="Combo size" orientation="horizontal">
        <Segmented value={String(combSize)} onValueChange={(v) => void setCombSize(Number(v))} width="hug">
          {HERO_COMB_SIZES.map((n) => (
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
      <HeroSelectorMultiple
        size="sm"
        label="Include"
        emptyLabel="Any"
        value={includeHeroIds}
        onValueChange={setIncludeHeroes}
      />
      <HeroSelectorMultiple
        size="sm"
        label="Exclude"
        emptyLabel="None"
        value={excludeHeroIds}
        onValueChange={setExcludeHeroes}
      />
    </>
  );
}
