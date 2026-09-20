import { FilterToggleCell } from "~/components/patterns/filter-bar/FilterCell";
import { useControllableState } from "~/components/ui/hooks/use-controllable-state";
import { SegmentedItem } from "~/components/ui/segmented";

const VIEW_MODES = ["kills", "deaths", "kd"] as const;
export type HeatmapViewMode = (typeof VIEW_MODES)[number];

const VIEW_MODE_LABELS: Record<HeatmapViewMode, string> = {
  kills: "Kills",
  deaths: "Deaths",
  kd: "K/D",
};

export function HeatmapViewModeFilter({
  value: valueProp,
  defaultValue = "kills",
  onValueChange,
  ...props
}: Omit<
  React.ComponentProps<typeof FilterToggleCell>,
  "label" | "value" | "defaultValue" | "onValueChange" | "active" | "onReset" | "children"
> & {
  value?: HeatmapViewMode;
  /** The mode it starts in when uncontrolled, and the one the reset returns to. */
  defaultValue?: HeatmapViewMode;
  onValueChange?: (mode: HeatmapViewMode) => void;
}) {
  const [value, setValue] = useControllableState({
    value: valueProp,
    defaultValue,
    onValueChange,
  });
  return (
    <FilterToggleCell
      label="Show"
      value={value}
      onValueChange={setValue}
      active={value !== defaultValue}
      onReset={() => setValue(defaultValue)}
      // Three segments stay under the auto-wide threshold, but these labels do not fit a default cell.
      width="wide"
      {...props}
    >
      {VIEW_MODES.map((mode) => (
        <SegmentedItem key={mode} value={mode}>
          {VIEW_MODE_LABELS[mode]}
        </SegmentedItem>
      ))}
    </FilterToggleCell>
  );
}
