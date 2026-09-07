import { LeaderboardRegionEnum } from "deadlock_api_client";

import { FilterToggleCell } from "./FilterCell";

const REGION_OPTIONS = Object.entries(LeaderboardRegionEnum).map(([key, value]) => ({ value, label: key }));

export function RegionFilter({ value, onChange }: { value: string; onChange: (region: string) => void }) {
  return <FilterToggleCell label="Region" value={value} onValueChange={onChange} options={REGION_OPTIONS} />;
}
