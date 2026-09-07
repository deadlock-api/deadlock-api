import { FilterToggleCell } from "./FilterCell";

const VIEW_MODES = ["kills", "deaths", "kd"] as const;
type ViewMode = (typeof VIEW_MODES)[number];

const VIEW_MODE_LABELS: Record<ViewMode, string> = {
  kills: "Kills",
  deaths: "Deaths",
  kd: "K/D",
};

const OPTIONS = VIEW_MODES.map((mode) => ({ value: mode, label: VIEW_MODE_LABELS[mode] }));

export function HeatmapViewModeFilter({ value, onChange }: { value: string; onChange: (mode: string) => void }) {
  return (
    <FilterToggleCell
      label="Show"
      value={value as ViewMode}
      onValueChange={onChange}
      options={OPTIONS}
      active={value !== "kills"}
    />
  );
}
