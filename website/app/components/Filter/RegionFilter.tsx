import { LeaderboardRegionEnum } from "deadlock_api_client";

import { StringSelector } from "~/components/selectors/StringSelector";

import { createFilter } from "./createFilter";

const regionOptions = Object.entries(LeaderboardRegionEnum).map(([key, val]) => ({
  label: key,
  value: val,
}));

export const RegionFilter = createFilter<{
  value: string;
  onChange: (region: string) => void;
}>({
  useDescription(props) {
    const label = regionOptions.find((o) => o.value === props.value)?.label ?? null;
    return { region: label };
  },
  Render({ value, onChange }) {
    return <StringSelector label="Region" options={regionOptions} selected={value} onSelect={onChange} />;
  },
});
