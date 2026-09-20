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
        onValueChange={(v) => setCombSize(Number(v))}
        active={combSize !== 2}
        onReset={() => setCombSize(2)}
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
        onValueChange={(v) => setCombsToShow(Number(v))}
        active={combsToShow !== ITEM_COMBS_TO_SHOW[0]}
        onReset={() => setCombsToShow(ITEM_COMBS_TO_SHOW[0])}
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
