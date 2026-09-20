import { MetricSelect } from "~/components/patterns/charts/MetricSelect";
import { Field } from "~/components/ui/field";
import { Segmented } from "~/components/ui/segmented";
import { useHydrated } from "~/hooks/useHydrated";
import { cn } from "~/lib/utils";

interface TrendMetricFieldProps extends Omit<
  React.ComponentProps<typeof Field>,
  "label" | "onChange" | "defaultValue"
> {
  value: string;
  /** The selected option in words; see `MetricSelect`. */
  valueLabel?: string;
  onValueChange?: (value: string) => void;
  label?: string;
  /** The `SelectItem`s and `SelectGroup`s of the `MetricSelect`. */
  children?: React.ReactNode;
}

/** The metric picker of a trend toolbar. */
export function TrendMetricField({
  value,
  valueLabel,
  onValueChange,
  label = "Metric",
  className,
  children,
  ...props
}: TrendMetricFieldProps) {
  return (
    <Field label={label} orientation="horizontal" className={cn("w-full @sm:w-auto", className)} {...props}>
      <MetricSelect value={value} valueLabel={valueLabel} onValueChange={onValueChange}>
        {children}
      </MetricSelect>
    </Field>
  );
}

interface TrendIntervalFieldProps extends Omit<
  React.ComponentProps<typeof Field>,
  "label" | "onChange" | "defaultValue"
> {
  value: string;
  onValueChange?: (value: string) => void;
  label?: string;
}

/** The bucket picker of a trend toolbar; its segments are disabled until the client has hydrated. */
export function TrendIntervalField({
  value,
  onValueChange,
  label = "Group by",
  children,
  ...props
}: TrendIntervalFieldProps) {
  const hydrated = useHydrated();
  return (
    <Field label={label} orientation="horizontal" {...props}>
      <Segmented
        size="lg"
        width="hug"
        aria-label={label}
        value={value}
        onValueChange={onValueChange}
        disabled={!hydrated}
      >
        {children}
      </Segmented>
    </Field>
  );
}
