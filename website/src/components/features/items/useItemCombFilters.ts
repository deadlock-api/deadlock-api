import { parseAsInteger, useQueryState } from "nuqs";

export const ITEM_COMB_SIZES = [2, 3, 4];
export const ITEM_COMBS_TO_SHOW = [50, 100, 250, 500];

/** URL-backed state for the item combinations tab, read by both the filter bar and the table. */
export function useItemCombFilters(defaultCombsToShow = ITEM_COMBS_TO_SHOW[0]) {
  const [combSize, setCombSize] = useQueryState("item_comb_size", parseAsInteger.withDefault(2));
  const [combsToShow, setCombsToShow] = useQueryState(
    "item_combs_to_show",
    parseAsInteger.withDefault(defaultCombsToShow),
  );
  return { combSize, setCombSize, combsToShow, setCombsToShow };
}
