import { LeaderboardRegionEnum } from "deadlock_api_client";

import { FilterToggleCell } from "~/components/patterns/filter-bar/FilterCell";
import { useControllableState } from "~/components/ui/hooks/use-controllable-state";
import { SegmentedItem } from "~/components/ui/segmented";
import { REGION_LABELS } from "~/lib/region";

const REGIONS = Object.values(LeaderboardRegionEnum);

export function RegionFilter({
  value: valueProp,
  defaultValue = REGIONS[0],
  onValueChange,
  ...props
}: Omit<
  React.ComponentProps<typeof FilterToggleCell>,
  "label" | "value" | "defaultValue" | "onValueChange" | "active" | "onReset" | "children"
> & {
  value?: string;
  /** The region it starts on when uncontrolled, and the one the reset returns to. */
  defaultValue?: string;
  onValueChange?: (region: string) => void;
}) {
  const [value, setValue] = useControllableState({
    value: valueProp,
    defaultValue,
    onValueChange,
  });
  return (
    <FilterToggleCell
      label="Region"
      value={value}
      onValueChange={setValue}
      active={value !== defaultValue}
      onReset={() => setValue(defaultValue)}
      {...props}
    >
      {REGIONS.map((region) => (
        <SegmentedItem key={region} value={region}>
          {REGION_LABELS[region]}
        </SegmentedItem>
      ))}
    </FilterToggleCell>
  );
}
