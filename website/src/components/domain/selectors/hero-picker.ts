import type { TriState } from "~/components/patterns/filter-bar/TriStateSelector";

/**
 * The pure rules of picking heroes, shared by `useHeroPicker` and its tests: which heroes a search keeps, what a press
 * does to the value in each selection mode, and where the arrow keys move in a grid of five.
 */

/** How a hero grid picks: one hero, any number of heroes, or each hero included, excluded or neither. */
export type HeroSelectionMode = "single" | "multiple" | "tri-state";

/** The same two states as every other include / exclude filter. */
export type HeroTriState = TriState;

/** What one tile shows: nothing, chosen (single / multiple), or its tri-state. */
export type HeroTileState = "none" | "selected" | HeroTriState;

/** Every hero grid has five portraits a row; the tiles shrink in a narrow container rather than dropping a column. */
export const HERO_GRID_COLUMNS = 5;

export interface PickableHero {
  id: number;
  name: string;
}

/** The heroes whose name contains the query, ignoring case and surrounding space, in the order they came in. */
export function filterHeroes<T extends PickableHero>(heroes: readonly T[], query: string): readonly T[] {
  const term = query.trim().toLowerCase();
  if (!term) return heroes;
  return heroes.filter((hero) => hero.name.toLowerCase().includes(term));
}

/** neither → included → excluded → neither. */
export function cycleTriState(state: HeroTriState | undefined): HeroTriState | undefined {
  if (state === undefined) return "included";
  if (state === "included") return "excluded";
  return undefined;
}

/** A new map with the hero moved one step along its cycle; a hero back at neither has no key. */
export function toggleTriState(value: ReadonlyMap<number, HeroTriState>, heroId: number): Map<number, HeroTriState> {
  const next = new Map(value);
  const state = cycleTriState(value.get(heroId));
  if (state) next.set(heroId, state);
  else next.delete(heroId);
  return next;
}

/** The list with the hero added at the end, or taken out. */
export function toggleHero(value: readonly number[], heroId: number): number[] {
  return value.includes(heroId) ? value.filter((id) => id !== heroId) : [...value, heroId];
}

/** The trigger's summary of a tri-state value: "Any", "+2", "-1", "+2 / -1". */
export function triStateSummary(value: ReadonlyMap<number, HeroTriState>): string {
  if (value.size === 0) return "Any";
  let included = 0;
  for (const state of value.values()) if (state === "included") included++;
  const excluded = value.size - included;
  return [included > 0 && `+${included}`, excluded > 0 && `-${excluded}`].filter(Boolean).join(" / ");
}

/** The trigger's summary of a list of heroes: "Any", "1 hero", "3 heroes". */
export function multipleSummary(count: number, emptyLabel = "Any"): string {
  if (count === 0) return emptyLabel;
  return count === 1 ? "1 hero" : `${count} heroes`;
}

/**
 * Where a key moves the cursor in a grid of `count` tiles laid out `columns` a row (WAI-ARIA grid pattern): arrows
 * move one tile, Home and End to the ends of the row, Control Home or End to the first or last tile. `null` is a key
 * the grid does not handle; `"exit-up"` is ArrowUp on the first row, which hands focus back to the search box above.
 */
export function moveInGrid(
  index: number,
  key: string,
  count: number,
  { columns = HERO_GRID_COLUMNS, jump = false }: { columns?: number; jump?: boolean } = {},
): number | "exit-up" | null {
  if (count === 0) return null;
  const column = index % columns;
  const last = count - 1;
  switch (key) {
    case "ArrowRight":
      return Math.min(index + 1, last);
    case "ArrowLeft":
      return Math.max(index - 1, 0);
    case "ArrowDown":
      // Down from a row above a ragged last row lands on the last tile rather than nowhere.
      return index + columns <= last ? index + columns : index - column + columns <= last ? last : index;
    case "ArrowUp":
      return index - columns >= 0 ? index - columns : "exit-up";
    case "Home":
      return jump ? 0 : index - column;
    case "End":
      return jump ? last : Math.min(index - column + columns - 1, last);
    case "PageDown":
      return Math.min(index + columns * 3, last);
    case "PageUp":
      return Math.max(index - columns * 3, 0);
    default:
      return null;
  }
}
