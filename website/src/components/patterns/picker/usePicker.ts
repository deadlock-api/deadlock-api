import { type KeyboardEvent, useId, useMemo, useState } from "react";

import {
  filterByName,
  moveInRows,
  type Pickable,
  type PickerSelectionMode,
  type PickerTileState,
  type PickerTriState,
  toggleInList,
  toggleTriState,
} from "~/components/patterns/picker/picker";
import { useControllableState } from "~/components/ui/hooks/use-controllable-state";

const NO_IDS: readonly number[] = [];
const NO_STATES: ReadonlyMap<number, PickerTriState> = new Map();

/** The value of each selection mode, with the matching `value` / `defaultValue` / `onValueChange`. */
export type PickerSelectionProps =
  | {
      /** One choice; `null` is none. The default mode. */
      selection?: "single";
      value?: number | null;
      defaultValue?: number | null;
      onValueChange?: (id: number | null) => void;
    }
  | {
      /** Any number of choices; a press adds or removes one. */
      selection: "multiple";
      value?: readonly number[];
      defaultValue?: readonly number[];
      onValueChange?: (ids: number[]) => void;
    }
  | {
      /** Each choice included, excluded or neither; a press moves it one step along that cycle. */
      selection: "tri-state";
      /** Id to included / excluded; a choice that is neither has no key. */
      value?: ReadonlyMap<number, PickerTriState>;
      defaultValue?: ReadonlyMap<number, PickerTriState>;
      onValueChange?: (value: Map<number, PickerTriState>) => void;
    };

export type PickerOptions<T extends Pickable> = PickerSelectionProps & {
  /** What the grid offers, in the order it shows them. */
  choices: readonly T[];
  /** Choices that are shown but cannot be picked (no data, already drafted). */
  disabledIds?: ReadonlySet<number>;
  /**
   * When Enter in the search box picks the first match: `searching`, only once something is typed (a filter, where
   * an empty Enter picking the first choice would surprise); `always`, also on an empty search, where the first tile
   * is a recommendation (the Team Builder's ranked roster).
   */
  enterPicks?: "searching" | "always";
};

export type Picker<T extends Pickable = Pickable> = ReturnType<typeof usePicker<T>>;

const TILE_SELECTOR = "[data-picker-id]";

/**
 * The behaviour of a picker grid, without its look: the search, the choices it keeps, the value of the selection
 * mode, and the keyboard cursor. `PickerGrid`, `PickerGridTile` and `PickerGridSearch` draw it; render
 * `picker.matches`, in order, as the grid's tiles (directly or in `PickerGridGroup`s).
 *
 * Keyboard (WAI-ARIA grid pattern with a roving tabindex): the grid is one tab stop; arrows move between tiles, Home
 * and End within a row, Control Home or End to the ends, Page Up and Down three rows; Enter or Space picks. The rows
 * are read from the grid as drawn, so groups that end on a short row move as they look. In the search box Enter
 * picks the first match and ArrowDown enters the grid; ArrowUp on the first row and typing in the grid return to the
 * search box.
 */
export function usePicker<T extends Pickable>(options: PickerOptions<T>) {
  const { choices, disabledIds, enterPicks = "searching" } = options;
  const selection: PickerSelectionMode = options.selection ?? "single";
  const [value, setValue] = useControllableState<unknown>({
    value: options.value,
    defaultValue:
      options.defaultValue ?? (selection === "single" ? null : selection === "multiple" ? NO_IDS : NO_STATES),
    onValueChange: options.onValueChange as ((value: unknown) => void) | undefined,
  });
  const [search, setSearch] = useState("");
  const [cursor, setCursor] = useState<number | null>(null);
  const baseId = useId();
  const gridId = `${baseId}-grid`;
  const searchId = `${baseId}-search`;

  const matches = useMemo(() => filterByName(choices, search), [choices, search]);
  // The cursor is the one tile in the tab order; when its choice is filtered out it falls back to the first match.
  // Before any move it starts on the choice of a single picker, so Tab lands where the choice is.
  const start =
    selection === "single" && matches.some((choice) => choice.id === value) ? (value as number) : matches[0]?.id;
  const activeId = cursor !== null && matches.some((choice) => choice.id === cursor) ? cursor : start;

  const isDisabled = (id: number) => disabledIds?.has(id) ?? false;

  const stateOf = (id: number): PickerTileState => {
    if (selection === "single") return value === id ? "selected" : "none";
    if (selection === "multiple") return (value as readonly number[]).includes(id) ? "selected" : "none";
    return (value as ReadonlyMap<number, PickerTriState>).get(id) ?? "none";
  };

  const pick = (id: number) => {
    if (isDisabled(id)) return;
    setCursor(id);
    if (selection === "single") setValue(id);
    else if (selection === "multiple") setValue(toggleInList(value as readonly number[], id));
    else setValue(toggleTriState(value as ReadonlyMap<number, PickerTriState>, id));
  };

  /** Sets the whole value at once: a reset, "show all", "any". */
  const setSelection = setValue as {
    (value: number | null): void;
    (value: number[]): void;
    (value: Map<number, PickerTriState>): void;
  };

  const tileId = (id: number) => `${baseId}-choice-${id}`;
  const focusTile = (id: number | undefined) => {
    if (id === undefined) return;
    setCursor(id);
    const tile = document.getElementById(tileId(id));
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
    // The rows as drawn: a grid of groups has a short row at the end of each group.
    const rows = [...event.currentTarget.querySelectorAll('[data-slot="picker-grid-row"]')].map((row) =>
      [...row.querySelectorAll<HTMLElement>(TILE_SELECTOR)].map((tile) => Number(tile.dataset.pickerId)),
    );
    const order = rows.flat();
    const index = order.indexOf(activeId ?? Number.NaN);
    if (index < 0) return;
    const next = moveInRows(
      index,
      event.key,
      rows.map((row) => row.length),
      { jump: event.ctrlKey || event.metaKey },
    );
    if (next === null) return;
    event.preventDefault();
    if (next === "exit-up") input?.focus();
    else focusTile(order[next]);
  };

  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusTile(activeId);
    } else if (event.key === "Enter") {
      // Enter takes the first match, so typing "kel" and Enter picks Kelvin without moving into the grid.
      const first = matches.find((choice) => !isDisabled(choice.id));
      if (!search.trim() && enterPicks === "searching") return;
      if (!first) return;
      event.preventDefault();
      pick(first.id);
    }
  };

  return {
    selection,
    choices,
    matches,
    search,
    setSearch: (next: string) => setSearch(next),
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
