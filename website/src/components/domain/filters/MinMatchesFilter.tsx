import { NumberSelector } from "~/components/patterns/filter-bar/NumberSelector";
import { useControllableState } from "~/components/ui/hooks/use-controllable-state";

export function MinMatchesFilter({
  value: valueProp,
  defaultValue,
  onValueChange,
  label = "Min Matches",
  step = 10,
  min,
  max,
  ...props
}: Omit<
  React.ComponentProps<typeof NumberSelector>,
  "value" | "defaultValue" | "onValueChange" | "label" | "step" | "min" | "max"
> & {
  value?: number;
  /** The threshold it starts at when uncontrolled, and the one the reset returns to. */
  defaultValue?: number;
  onValueChange?: (value: number) => void;
  label?: string;
  step?: number;
  min?: number;
  max?: number;
}) {
  const [value, setValue] = useControllableState({
    value: valueProp,
    defaultValue: defaultValue ?? min ?? 0,
    onValueChange,
  });
  return (
    <NumberSelector
      value={value}
      onValueChange={setValue}
      label={label}
      step={step}
      min={min}
      max={max}
      defaultValue={defaultValue}
      {...props}
    />
  );
}
