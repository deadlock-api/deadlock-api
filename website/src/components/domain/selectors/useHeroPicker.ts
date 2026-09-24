import { useQuery } from "@tanstack/react-query";

import type { PickableHero } from "~/components/domain/selectors/hero-picker";
import { type PickerSelectionProps, usePicker } from "~/components/patterns/picker/usePicker";
import { heroesQueryOptions } from "~/queries/asset-queries";

/** The playable roster (no hero still in development), sorted by name: what every hero picker offers by default. */
export function useHeroRoster() {
  const { data: heroes = [], isLoading } = useQuery({
    ...heroesQueryOptions,
    select: (all) => all.filter((hero) => !hero.in_development).sort((a, b) => a.name.localeCompare(b.name)),
  });
  return { heroes, isLoading };
}

/** The value of each selection mode, with the matching `value` / `defaultValue` / `onValueChange`. */
export type HeroSelectionProps = PickerSelectionProps;

export type HeroPickerOptions<T extends PickableHero> = HeroSelectionProps & {
  /** The heroes on offer, in the order the grid shows them. */
  heroes: readonly T[];
  /** Heroes that are shown but cannot be picked (no data, already drafted). */
  disabledHeroIds?: ReadonlySet<number>;
  /**
   * When Enter in the search box picks the first match: `searching`, only once something is typed (a filter, where
   * an empty Enter picking the first hero by name would surprise); `always`, also on an empty search, where the
   * first tile is a recommendation (the Team Builder's ranked roster).
   */
  enterPicks?: "searching" | "always";
};

export type HeroPicker<T extends PickableHero = PickableHero> = ReturnType<typeof useHeroPicker<T>>;

/**
 * `usePicker` over heroes: the search, the heroes it keeps (`matches`), the value of the selection mode and the
 * keyboard cursor. `HeroGrid`, `HeroGridTile` and `HeroGridSearch` draw it; render `picker.matches`, in order, as the
 * grid's tiles. The keyboard is the picker grid's (see `usePicker`).
 */
export function useHeroPicker<T extends PickableHero>({ heroes, disabledHeroIds, ...options }: HeroPickerOptions<T>) {
  const picker = usePicker<T>({ ...options, choices: heroes, disabledIds: disabledHeroIds });
  return { ...picker, heroes };
}
