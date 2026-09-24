import type { TriState } from "~/components/patterns/filter-bar/TriStateSelector";

/**
 * The pure rules of a picker grid (the hero portraits, the item shop), shared by `usePicker` and its tests: which
 * choices a search keeps, what a press does to the value in each selection mode, and where the arrow keys move.
 */

/** How a picker grid picks: one choice, any number of choices, or each choice included, excluded or neither. */
export type PickerSelectionMode = "single" | "multiple" | "tri-state";

/** The same two states as every other include / exclude filter. */
export type PickerTriState = TriState;

/** What one tile shows: nothing, chosen (single / multiple), or its tri-state. */
export type PickerTileState = "none" | "selected" | PickerTriState;

/** Every picker grid has five tiles a row; the tiles shrink in a narrow container rather than dropping a column. */
export const PICKER_COLUMNS = 5;

/** One thing a picker offers: a hero, an item. */
export interface Pickable {
  id: number;
  name: string;
}

/** The choices whose name contains the query, ignoring case and surrounding space, in the order they came in. */
export function filterByName<T extends Pickable>(choices: readonly T[], query: string): readonly T[] {
  const term = query.trim().toLowerCase();
  if (!term) return choices;
  return choices.filter((choice) => choice.name.toLowerCase().includes(term));
}

/** neither → included → excluded → neither. */
export function cycleTriState(state: PickerTriState | undefined): PickerTriState | undefined {
  if (state === undefined) return "included";
  if (state === "included") return "excluded";
  return undefined;
}

/** A new map with the choice moved one step along its cycle; a choice back at neither has no key. */
export function toggleTriState(value: ReadonlyMap<number, PickerTriState>, id: number): Map<number, PickerTriState> {
  const next = new Map(value);
  const state = cycleTriState(value.get(id));
  if (state) next.set(id, state);
  else next.delete(id);
  return next;
}

/** The list with the choice added at the end, or taken out. */
export function toggleInList(value: readonly number[], id: number): number[] {
  return value.includes(id) ? value.filter((other) => other !== id) : [...value, id];
}

/** The ids a value holds, whatever its mode: the one choice, the list, or every key of the tri-state map. */
export function chosenIds(value: number | null | readonly number[] | ReadonlyMap<number, PickerTriState>): Set<number> {
  if (value === null) return new Set();
  if (typeof value === "number") return new Set([value]);
  if (value instanceof Map) return new Set(value.keys());
  return new Set(value as readonly number[]);
}

/** The trigger's summary of a tri-state value: "Any", "+2", "-1", "+2 / -1". */
export function triStateSummary(value: ReadonlyMap<number, PickerTriState>): string {
  if (value.size === 0) return "Any";
  let included = 0;
  for (const state of value.values()) if (state === "included") included++;
  const excluded = value.size - included;
  return [included > 0 && `+${included}`, excluded > 0 && `-${excluded}`].filter(Boolean).join(" / ");
}

/** The trigger's summary of a list: "Any", "1 hero", "3 heroes". */
export function countSummary(
  count: number,
  { one, other, empty = "Any" }: { one: string; other: string; empty?: string },
): string {
  if (count === 0) return empty;
  return count === 1 ? `1 ${one}` : `${count} ${other}`;
}

/** The lengths of the rows `count` tiles fill at `columns` a row: 12 at five a row is [5, 5, 2]. */
export function rowLengths(count: number, columns = PICKER_COLUMNS): number[] {
  const lengths: number[] = [];
  for (let start = 0; start < count; start += columns) lengths.push(Math.min(columns, count - start));
  return lengths;
}

/**
 * Where a key moves the cursor in a grid whose rows hold `sizes[i]` tiles each, counted in reading order (WAI-ARIA
 * grid pattern). Rows may be ragged: a picker grouped by tier ends every group on a short row. Left and Right step
 * through the tiles in reading order, across the end of a row; Up and Down keep the column, or land on the last tile
 * of a shorter row; Home and End go to the ends of the row, with `jump` (Control) to the first or last tile; Page Up
 * and Down move three rows. `null` is a key the grid does not handle; `"exit-up"` is ArrowUp on the first row, which
 * hands focus back to the search box above.
 */
export function moveInRows(
  index: number,
  key: string,
  sizes: readonly number[],
  { jump = false }: { jump?: boolean } = {},
): number | "exit-up" | null {
  const count = sizes.reduce((sum, length) => sum + length, 0);
  if (count === 0 || index < 0 || index >= count) return null;
  const starts: number[] = [];
  let row = 0;
  for (let i = 0, start = 0; i < sizes.length; start += sizes[i], i++) {
    starts.push(start);
    if (index >= start && index < start + sizes[i]) row = i;
  }
  const column = index - starts[row];
  const last = count - 1;
  const at = (target: number) => starts[target] + Math.min(column, sizes[target] - 1);
  switch (key) {
    case "ArrowRight":
      return Math.min(index + 1, last);
    case "ArrowLeft":
      return Math.max(index - 1, 0);
    case "ArrowDown":
      return row + 1 < sizes.length ? at(row + 1) : index;
    case "ArrowUp":
      return row > 0 ? at(row - 1) : "exit-up";
    case "Home":
      return jump ? 0 : starts[row];
    case "End":
      return jump ? last : starts[row] + sizes[row] - 1;
    case "PageDown":
      return row + 3 < sizes.length ? at(row + 3) : last;
    case "PageUp":
      return row - 3 >= 0 ? at(row - 3) : 0;
    default:
      return null;
  }
}

/** `moveInRows` over `count` tiles laid out `columns` a row, every row full but the last. */
export function moveInGrid(
  index: number,
  key: string,
  count: number,
  { columns = PICKER_COLUMNS, jump = false }: { columns?: number; jump?: boolean } = {},
): number | "exit-up" | null {
  return moveInRows(index, key, rowLengths(count, columns), { jump });
}
