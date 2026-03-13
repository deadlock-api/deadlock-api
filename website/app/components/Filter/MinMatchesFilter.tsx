import { NumberSelector } from "~/components/NumberSelector";

import { createFilter } from "./createFilter";

function formatMinMatches(value: number, label: string): string | null {
  if (value <= 0) return null;
  const shortLabel = label.replace(/^Min\s+/i, "").toLowerCase();
  return `min. ${value} ${shortLabel}`;
}

export const MinMatchesFilter = createFilter<{
  value: number;
  onChange: (val: number) => void;
  label?: string;
  step?: number;
  min?: number;
  max?: number;
}>({
  useDescription(props) {
    const label = props.label ?? "Min Matches";
    return { [`minMatches:${label}`]: formatMinMatches(props.value, label) };
  },
  Render({ value, onChange, label = "Min Matches", step = 10, min, max }) {
    return <NumberSelector value={value} onChange={onChange} label={label} step={step} min={min} max={max} />;
  },
});
