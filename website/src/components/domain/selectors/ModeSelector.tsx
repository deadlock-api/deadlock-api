import { FilterToggleCell } from "~/components/patterns/filter-bar/FilterCell";
import { SegmentedItem } from "~/components/ui/segmented";
import { DEFAULT_MODE, type Mode, MODE_CONFIG } from "~/lib/game-mode";

const MODES = Object.keys(MODE_CONFIG) as Mode[];

export function ModeSelector({
  value,
  defaultValue = DEFAULT_MODE,
  onValueChange,
  modes = MODES,
  disabledModes,
  ...props
}: Omit<
  React.ComponentProps<typeof FilterToggleCell<Mode>>,
  "label" | "value" | "defaultValue" | "onValueChange" | "active" | "onReset" | "children"
> & {
  value?: Mode;
  /** The mode it starts in when uncontrolled, and the one the reset returns to. */
  defaultValue?: Mode;
  onValueChange?: (mode: Mode) => void;
  /** The modes offered, in this order; all of them by default. Leave out a mode a page can never show data for. */
  modes?: readonly Mode[];
  /** Modes shown but not selectable, for views that have no data in them (no soul economy in Street Brawl). */
  disabledModes?: readonly Mode[];
}) {
  return (
    <FilterToggleCell label="Mode" value={value} defaultValue={defaultValue} onValueChange={onValueChange} {...props}>
      {modes.map((mode) => (
        <SegmentedItem key={mode} value={mode} disabled={disabledModes?.includes(mode)}>
          {MODE_CONFIG[mode].label}
        </SegmentedItem>
      ))}
    </FilterToggleCell>
  );
}
