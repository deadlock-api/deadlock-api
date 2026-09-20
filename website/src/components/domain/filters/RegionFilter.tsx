import { LeaderboardRegionEnum } from "deadlock_api_client";

import { FilterToggleCell } from "~/components/patterns/filter-bar/FilterCell";
import { SegmentedItem } from "~/components/ui/segmented";
import { REGION_LABELS } from "~/lib/region";

const REGIONS = Object.values(LeaderboardRegionEnum);

export function RegionFilter({
  value,
  defaultValue = REGIONS[0],
  onValueChange,
  ...props
}: Omit<
  React.ComponentProps<typeof FilterToggleCell<LeaderboardRegionEnum>>,
  "label" | "value" | "defaultValue" | "onValueChange" | "active" | "onReset" | "children"
> & {
  value?: LeaderboardRegionEnum;
  /** The region it starts on when uncontrolled, and the one the reset returns to. */
  defaultValue?: LeaderboardRegionEnum;
  onValueChange?: (region: LeaderboardRegionEnum) => void;
}) {
  return (
    <FilterToggleCell label="Region" value={value} defaultValue={defaultValue} onValueChange={onValueChange} {...props}>
      {REGIONS.map((region) => (
        <SegmentedItem key={region} value={region}>
          {REGION_LABELS[region]}
        </SegmentedItem>
      ))}
    </FilterToggleCell>
  );
}
