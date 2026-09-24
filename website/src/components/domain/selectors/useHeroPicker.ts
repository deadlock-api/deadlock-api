import { useQuery } from "@tanstack/react-query";
import { type KeyboardEvent, useId, useMemo, useState } from "react";

import {
  filterHeroes,
  HERO_GRID_COLUMNS,
  type HeroSelectionMode,
  type HeroTileState,
  type HeroTriState,
  moveInGrid,
  type PickableHero,
  toggleHero,
  toggleTriState,
} from "~/components/domain/selectors/hero-picker";
import { useControllableState } from "~/components/ui/hooks/use-controllable-state";
import { heroesQueryOptions } from "~/queries/asset-queries";

/** The playable roster (no hero still in development), sorted by name: what every hero picker offers by default. */
export function useHeroRoster() {
  const { data: heroes = [], isLoading } = useQuery({
    ...heroesQueryOptions,
    select: (all) => all.filter((hero) => !hero.in_development).sort((a, b) => a.name.localeCompare(b.name)),
  });
  return { heroes, isLoading };
}

const NO_HEROES: readonly number[] = [];
const NO_STATES: ReadonlyMap<number, HeroTriState> = new Map();

/** The value of each selection mode, with the matching `value` / `defaultValue` / `onValueChange`. */
export type HeroSelectionProps =
  | {
      /** One hero; `null` is none. The default mode. */
      selection?: "single";
      value?: number | null;
      defaultValue?: number | null;
      onValueChange?: (heroId: number | null) => void;
    }
  | {
      /** Any number of heroes; a press adds or removes one. */
      selection: "multiple";
      value?: readonly number[];
      defaultValue?: readonly number[];
      onValueChange?: (heroIds: number[]) => void;
    }
  | {
      /** Each hero included, excluded or neither; a press moves it one step along that cycle. */
      selection: "tri-state";
      /** Hero id to included / excluded; a hero that is neither has no key. */
      value?: ReadonlyMap<number, HeroTriState>;
      defaultValue?: ReadonlyMap<number, HeroTriState>;
      onValueChange?: (value: Map<number, HeroTriState>) => void;
    };

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
 * The behaviour of a hero grid, without its look: the search, the heroes it keeps, the value of the selection mode,
 * and the keyboard cursor. `HeroGrid`, `HeroGridTile` and `HeroGridSearch` draw it; render `picker.matches`, in
 * order, as the grid's tiles.
 *
 * Keyboard (WAI-ARIA grid pattern with a roving tabindex): the grid is one tab stop; arrows move between tiles, Home
 * and End within a row, Control Home or End to the ends, Page Up and Down three rows; Enter or Space picks. In the
 * search box Enter picks the first match and ArrowDown enters the grid; ArrowUp on the first row and typing in the
 * grid return to the search box.
 */
export function useHeroPicker<T extends PickableHero>(options: HeroPickerOptions<T>) {
  const { heroes, disabledHeroIds, enterPicks = "searching" } = options;
  const selection: HeroSelectionMode = options.selection ?? "single";
  const [value, setValue] = useControllableState<unknown>({
    value: options.value,
    defaultValue:
      options.defaultValue ?? (selection === "single" ? null : selection === "multiple" ? NO_HEROES : NO_STATES),
    onValueChange: options.onValueChange as ((value: unknown) => void) | undefined,
  });
  const [search, setSearch] = useState("");
  const [cursor, setCursor] = useState<number | null>(null);
  const baseId = useId();
  const gridId = `${baseId}-grid`;
  const searchId = `${baseId}-search`;

  const matches = useMemo(() => filterHeroes(heroes, search), [heroes, search]);
  // The cursor is the one tile in the tab order; when its hero is filtered out it falls back to the first match.
  // Before any move it starts on the chosen hero of a single picker, so Tab lands where the choice is.
  const start =
    selection === "single" && matches.some((hero) => hero.id === value) ? (value as number) : matches[0]?.id;
  const activeId = cursor !== null && matches.some((hero) => hero.id === cursor) ? cursor : start;

  const isDisabled = (heroId: number) => disabledHeroIds?.has(heroId) ?? false;

  const stateOf = (heroId: number): HeroTileState => {
    if (selection === "single") return value === heroId ? "selected" : "none";
    if (selection === "multiple") return (value as readonly number[]).includes(heroId) ? "selected" : "none";
    return (value as ReadonlyMap<number, HeroTriState>).get(heroId) ?? "none";
  };

  const pick = (heroId: number) => {
    if (isDisabled(heroId)) return;
    setCursor(heroId);
    if (selection === "single") setValue(heroId);
    else if (selection === "multiple") setValue(toggleHero(value as readonly number[], heroId));
    else setValue(toggleTriState(value as ReadonlyMap<number, HeroTriState>, heroId));
  };

  /** Sets the whole value at once: a reset, "show all", "any hero". */
  const setSelection = setValue as {
    (value: number | null): void;
    (value: number[]): void;
    (value: Map<number, HeroTriState>): void;
  };

  const tileId = (heroId: number) => `${baseId}-hero-${heroId}`;
  const focusTile = (heroId: number | undefined) => {
    if (heroId === undefined) return;
    setCursor(heroId);
    const tile = document.getElementById(tileId(heroId));
    tile?.focus();
    tile?.scrollIntoView({ block: "nearest" });
  };

  const onGridKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.altKey) return;
    const input = document.getElementById(searchId);
    // Typing in the grid goes on in the search box, so a slip of the arrow keys does not end the search.
    if (input && !event.ctrlKey && !event.metaKey && (event.key.length === 1 || event.key === "Backspace")) {
      if (event.key !== " ") input.focus();
      return;
    }
    const index = matches.findIndex((hero) => hero.id === activeId);
    if (index < 0) return;
    const next = moveInGrid(index, event.key, matches.length, {
      columns: HERO_GRID_COLUMNS,
      jump: event.ctrlKey || event.metaKey,
    });
    if (next === null) return;
    event.preventDefault();
    if (next === "exit-up") input?.focus();
    else focusTile(matches[next].id);
  };

  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusTile(activeId);
    } else if (event.key === "Enter") {
      // Enter takes the first match, so typing "kel" and Enter picks Kelvin without moving into the grid.
      const first = matches.find((hero) => !isDisabled(hero.id));
      if (!search.trim() && enterPicks === "searching") return;
      if (!first) return;
      event.preventDefault();
      pick(first.id);
    }
  };

  return {
    selection,
    heroes,
    matches,
    search,
    setSearch,
    value,
    setSelection,
    stateOf,
    isDisabled,
    pick,
    activeId,
    setActiveId: setCursor,
    gridId,
    searchId,
    tileId,
    onGridKeyDown,
    onSearchKeyDown,
  };
}
