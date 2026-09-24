import {
  countSummary,
  filterByName,
  type Pickable,
  PICKER_COLUMNS,
  type PickerSelectionMode,
  type PickerTileState,
  type PickerTriState,
  toggleInList,
} from "~/components/patterns/picker/picker";

/**
 * The hero names for the rules of a picker grid (`patterns/picker/picker`): the hero pickers are that grid over the
 * roster.
 */
export { cycleTriState, moveInGrid, toggleTriState, triStateSummary } from "~/components/patterns/picker/picker";

export type HeroSelectionMode = PickerSelectionMode;
export type HeroTriState = PickerTriState;
export type HeroTileState = PickerTileState;
export type PickableHero = Pickable;

/** Five portraits a row, like every picker grid. */
export const HERO_GRID_COLUMNS = PICKER_COLUMNS;

/** The heroes whose name contains the query, ignoring case and surrounding space, in the order they came in. */
export const filterHeroes = filterByName;

/** The list with the hero added at the end, or taken out. */
export const toggleHero = toggleInList;

/** The trigger's summary of a list of heroes: "Any", "1 hero", "3 heroes". */
export function multipleSummary(count: number, emptyLabel = "Any"): string {
  return countSummary(count, { one: "hero", other: "heroes", empty: emptyLabel });
}
