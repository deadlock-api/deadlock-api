import { useState } from "react";

import { HeroImage } from "~/components/domain/assets/HeroImage";
import { type HeroTriState, multipleSummary, triStateSummary } from "~/components/domain/selectors/hero-picker";
import { HeroGrid, HeroGridSearch, HeroGridTile } from "~/components/domain/selectors/HeroGrid";
import { type HeroSelectionProps, useHeroPicker, useHeroRoster } from "~/components/domain/selectors/useHeroPicker";
import { FilterCell, type FilterCellPassthroughProps } from "~/components/patterns/filter-bar/FilterCell";
import { OptionRow } from "~/components/ui/option-row";
import { SCROLLBAR_THIN } from "~/components/ui/recipes";
import { cn } from "~/lib/utils";

type HeroSelectorProps = Omit<FilterCellPassthroughProps, "icon"> & {
  /** The cell's label: "Hero" for one hero, "Heroes" otherwise. */
  label?: string;
} & (
    | (Extract<HeroSelectionProps, { selection?: "single" }> & {
        /** Adds "Any hero" above the grid: the value `null`. */
        allowNull?: boolean;
        emptyLabel?: never;
      })
    | (Extract<HeroSelectionProps, { selection: "multiple" }> & {
        allowNull?: never;
        /** The cell's value with no hero chosen. */
        emptyLabel?: string;
      })
    | (Extract<HeroSelectionProps, { selection: "tri-state" }> & { allowNull?: never; emptyLabel?: never })
  );

/**
 * The one hero filter: a `FilterCell` whose popover holds a search box over the portrait grid (`HeroGrid`).
 * `selection` picks what it holds: `single` (one hero, closes on a pick; `allowNull` adds "Any hero"), `multiple`
 * (a list of heroes) or `tri-state` (each hero included, excluded or neither, as a map). A `defaultValue` is what the
 * reset returns to and what counts as inactive. In a filter bar use `Filter.Hero`; in a toolbar pass `size="sm"`.
 */
export function HeroSelector(props: HeroSelectorProps) {
  const {
    selection = "single",
    value: _value,
    defaultValue,
    onValueChange,
    allowNull,
    emptyLabel,
    label = selection === "single" ? "Hero" : "Heroes",
    contentClassName,
    ...cellProps
  } = props;
  const { heroes } = useHeroRoster();
  const [open, setOpen] = useState(false);
  const picker = useHeroPicker({
    selection,
    value: props.value,
    defaultValue,
    heroes,
    // A hero is one choice, so picking it closes the editor like a select would; lists stay open for the next pick.
    onValueChange: (next: unknown) => {
      (onValueChange as ((value: unknown) => void) | undefined)?.(next);
      if (selection === "single") {
        picker.setSearch("");
        setOpen(false);
      }
    },
  } as unknown as Parameters<typeof useHeroPicker>[0]);

  let display: string;
  let active: boolean;
  let firstHero: number | undefined;
  let reset: (() => void) | undefined;
  if (selection === "single") {
    const heroId = picker.value as number | null;
    const hero = heroes.find((h) => h.id === heroId);
    firstHero = hero?.id;
    display = hero?.name ?? "Any";
    const initial = (defaultValue as number | null | undefined) ?? null;
    active = heroId !== initial;
    reset = allowNull || initial != null ? () => picker.setSelection(initial) : undefined;
  } else if (selection === "multiple") {
    const ids = picker.value as readonly number[];
    firstHero = heroes.find((h) => ids.includes(h.id))?.id;
    display = multipleSummary(ids.length, emptyLabel);
    active = ids.length > 0;
    reset = () => picker.setSelection([]);
  } else {
    const states = picker.value as ReadonlyMap<number, HeroTriState>;
    firstHero = heroes.find((h) => states.has(h.id))?.id;
    display = triStateSummary(states);
    active = states.size > 0;
    reset = () => picker.setSelection(new Map());
  }

  return (
    <FilterCell
      label={label}
      value={display}
      active={active}
      onReset={reset}
      icon={
        firstHero !== undefined ? (
          <HeroImage heroId={firstHero} className="size-4 shrink-0 object-contain" />
        ) : undefined
      }
      contentClassName={cn("w-80 max-w-(--radix-popover-content-available-width) p-0", contentClassName)}
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) picker.setSearch("");
      }}
      {...cellProps}
    >
      <div className="border-b p-2">
        <HeroGridSearch picker={picker} />
      </div>
      <div className={cn(SCROLLBAR_THIN, "flex max-h-80 flex-col gap-1 overflow-y-auto p-2")}>
        {allowNull && !picker.search && (
          <OptionRow selected={picker.value == null} onClick={() => picker.setSelection(null)}>
            Any hero
          </OptionRow>
        )}
        <HeroGrid picker={picker} aria-label={label}>
          {picker.matches.map((hero) => (
            <HeroGridTile key={hero.id} hero={hero} />
          ))}
        </HeroGrid>
      </div>
      {selection === "tri-state" && (
        <p className="border-t px-3 py-2 text-2xs text-muted-foreground">
          Press a hero once to include it, again to exclude it, a third time to clear it.
        </p>
      )}
    </FilterCell>
  );
}
