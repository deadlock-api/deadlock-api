import { FilterToggleCell } from "~/components/patterns/filter-bar/FilterCell";
import { SegmentedItem } from "~/components/ui/segmented";
import { DEFAULT_MODE, type Mode, MODE_CONFIG } from "~/lib/game-mode";

const MODES = Object.keys(MODE_CONFIG) as Mode[];

export function ModeSelector({
  value,
  defaultValue = DEFAULT_MODE,
  onValueChange,
  ...props
}: Omit<
  React.ComponentProps<typeof FilterToggleCell<Mode>>,
  "label" | "value" | "defaultValue" | "onValueChange" | "active" | "onReset" | "children"
> & {
  value?: Mode;
  /** The mode it starts in when uncontrolled, and the one the reset returns to. */
  defaultValue?: Mode;
  onValueChange?: (mode: Mode) => void;
}) {
  return (
    <FilterToggleCell label="Mode" value={value} defaultValue={defaultValue} onValueChange={onValueChange} {...props}>
      {MODES.map((mode) => (
        <SegmentedItem key={mode} value={mode}>
          {MODE_CONFIG[mode].label}
        </SegmentedItem>
      ))}
    </FilterToggleCell>
  );
}
