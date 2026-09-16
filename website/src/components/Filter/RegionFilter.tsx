import { LeaderboardRegionEnum } from "deadlock_api_client";

import { REGION_LABELS } from "~/lib/region";

import { FilterToggleCell } from "./FilterCell";

const REGION_OPTIONS = Object.values(LeaderboardRegionEnum).map((value) => ({ value, label: REGION_LABELS[value] }));

export function RegionFilter({
  value,
  onChange,
  defaultValue,
}: {
  value: string;
  onChange: (region: string) => void;
  defaultValue: string;
}) {
  return (
    <FilterToggleCell
      label="Region"
      value={value}
      onValueChange={onChange}
      options={REGION_OPTIONS}
      active={value !== defaultValue}
      onReset={() => onChange(defaultValue)}
    />
  );
}
