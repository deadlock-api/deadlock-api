import { FilterToggleCell } from "./FilterCell";

const OPTIONS = [
  { value: "2d", label: "2D" },
  { value: "3d", label: "3D" },
] as const;

export function DimensionToggleFilter({ value, onChange }: { value: boolean; onChange: (is3D: boolean) => void }) {
  return (
    <FilterToggleCell
      label="View"
      value={value ? "3d" : "2d"}
      onValueChange={(next) => onChange(next === "3d")}
      options={OPTIONS}
      active={value}
    />
  );
}
