import { FilterToggleCell } from "~/components/patterns/filter-bar/FilterCell";
import { SegmentedItem } from "~/components/ui/segmented";

/** `true` is the 3D view. */
export function DimensionToggleFilter({
  value,
  defaultValue = false,
  onValueChange,
  ...props
}: Omit<
  React.ComponentProps<typeof FilterToggleCell>,
  "label" | "value" | "defaultValue" | "onValueChange" | "active" | "onReset" | "children"
> & {
  value?: boolean;
  /** The view it starts in when uncontrolled, and the one the reset returns to. */
  defaultValue?: boolean;
  onValueChange?: (is3D: boolean) => void;
}) {
  return (
    <FilterToggleCell
      label="View"
      value={value === undefined ? undefined : value ? "3d" : "2d"}
      defaultValue={defaultValue ? "3d" : "2d"}
      onValueChange={(next) => onValueChange?.(next === "3d")}
      {...props}
    >
      <SegmentedItem value="2d">2D</SegmentedItem>
      <SegmentedItem value="3d">3D</SegmentedItem>
    </FilterToggleCell>
  );
}
