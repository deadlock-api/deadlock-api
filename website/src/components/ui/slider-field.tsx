import { Field } from "~/components/ui/field";
import { Slider } from "~/components/ui/slider";
import { cn } from "~/lib/utils";

interface SliderFieldProps extends Omit<
  React.ComponentProps<typeof Slider>,
  "value" | "defaultValue" | "onValueChange" | "getValueText"
> {
  label: string;
  value: number;
  onValueChange: (value: number) => void;
  /** The value as the screen shows it, beside the slider and announced by its thumb: "70%" for 0.7. */
  format?: (value: number) => string;
  description?: React.ReactNode;
}

/**
 * One number picked on a slider, with its label above and its current value at the trailing end. `ref`, `min`, `max`,
 * `step`, `disabled` and the other slider props reach the slider; `className` styles the field.
 */
export function SliderField({
  label,
  value,
  onValueChange,
  format = String,
  description,
  className,
  ...props
}: SliderFieldProps) {
  return (
    <Field data-slot="slider-field" label={label} description={description} className={className}>
      <div className="flex min-w-0 items-center gap-3">
        <Slider
          aria-label={label}
          value={[value]}
          onValueChange={([next]) => next !== undefined && onValueChange(next)}
          getValueText={format}
          className="min-w-0 flex-1"
          {...props}
        />
        <span
          className={cn("min-w-10 shrink-0 text-end text-sm tabular-nums", props.disabled && "text-muted-foreground")}
        >
          {format(value)}
        </span>
      </div>
    </Field>
  );
}
