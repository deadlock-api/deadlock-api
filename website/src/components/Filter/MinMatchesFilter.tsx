import { NumberSelector } from "~/components/NumberSelector";

export function MinMatchesFilter({
  value,
  onChange,
  label = "Min Matches",
  step = 10,
  min,
  max,
  defaultValue,
}: {
  value: number;
  onChange: (val: number) => void;
  label?: string;
  step?: number;
  min?: number;
  max?: number;
  defaultValue?: number;
}) {
  return (
    <NumberSelector
      value={value}
      onChange={onChange}
      label={label}
      step={step}
      min={min}
      max={max}
      defaultValue={defaultValue}
    />
  );
}
