import { FilterToggleCell } from "~/components/patterns/filter-bar/FilterCell";
import { SegmentedItem } from "~/components/ui/segmented";

import { ITEM_COMB_SIZES, ITEM_COMBS_TO_SHOW, useItemCombFilters } from "./useItemCombFilters";

export function ItemCombFilters() {
  const { combSize, setCombSize, combsToShow, setCombsToShow } = useItemCombFilters();

  return (
    <>
      <FilterToggleCell
        label="Combo size"
        value={String(combSize)}
        defaultValue="2"
        onValueChange={(v) => setCombSize(Number(v))}
      >
        {ITEM_COMB_SIZES.map((size) => (
          <SegmentedItem key={size} value={String(size)}>
            {size}
          </SegmentedItem>
        ))}
      </FilterToggleCell>
      <FilterToggleCell
        label="Show"
        value={String(combsToShow)}
        defaultValue={String(ITEM_COMBS_TO_SHOW[0])}
        onValueChange={(v) => setCombsToShow(Number(v))}
      >
        {ITEM_COMBS_TO_SHOW.map((count) => (
          <SegmentedItem key={count} value={String(count)}>
            {count}
          </SegmentedItem>
        ))}
      </FilterToggleCell>
    </>
  );
}
