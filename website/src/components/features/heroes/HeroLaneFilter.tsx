import { FilterToggleCell } from "~/components/patterns/filter-bar/FilterCell";
import { SegmentedItem } from "~/components/ui/segmented";

/** Whether matchups count only heroes who shared a lane, or any two heroes in the same match. For a filter row. */
export function HeroLaneFilter({
  value,
  onValueChange,
}: {
  /** True: the same lane only. */
  value: boolean;
  onValueChange: (sameLane: boolean) => void;
}) {
  return (
    <FilterToggleCell
      label="Lane"
      value={value ? "same" : "any"}
      defaultValue="same"
      onValueChange={(v) => onValueChange(v === "same")}
    >
      <SegmentedItem value="same">Same lane</SegmentedItem>
      <SegmentedItem value="any">Any lane</SegmentedItem>
    </FilterToggleCell>
  );
}
