import { FilterToggleCell } from "~/components/patterns/filter-bar/FilterCell";
import { useControllableState } from "~/components/ui/hooks/use-controllable-state";
import { SegmentedItem } from "~/components/ui/segmented";

/** `true` is the 3D view. */
export function DimensionToggleFilter({
  value: valueProp,
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
  const [value, setValue] = useControllableState({
    value: valueProp,
    defaultValue,
    onValueChange,
  });
  return (
    <FilterToggleCell
      label="View"
      value={value ? "3d" : "2d"}
      onValueChange={(next) => setValue(next === "3d")}
      active={value !== defaultValue}
      onReset={() => setValue(defaultValue)}
      {...props}
    >
      <SegmentedItem value="2d">2D</SegmentedItem>
      <SegmentedItem value="3d">3D</SegmentedItem>
    </FilterToggleCell>
  );
}
