import { FilterToggleCell } from "~/components/Filter/FilterCell";

import { ITEM_COMB_SIZES, ITEM_COMBS_TO_SHOW, useItemCombFilters } from "./useItemCombFilters";

const SIZE_OPTIONS = ITEM_COMB_SIZES.map((n) => ({ value: String(n), label: String(n) }));
const SHOW_OPTIONS = ITEM_COMBS_TO_SHOW.map((n) => ({ value: String(n), label: String(n) }));

export function ItemCombFilters() {
  const { combSize, setCombSize, combsToShow, setCombsToShow } = useItemCombFilters();

  return (
    <>
      <FilterToggleCell
        label="Combo size"
        value={String(combSize)}
        onValueChange={(v) => setCombSize(Number(v))}
        options={SIZE_OPTIONS}
        active={combSize !== 2}
      />
      <FilterToggleCell
        label="Show"
        value={String(combsToShow)}
        onValueChange={(v) => setCombsToShow(Number(v))}
        options={SHOW_OPTIONS}
        active={combsToShow !== ITEM_COMBS_TO_SHOW[0]}
      />
    </>
  );
}
