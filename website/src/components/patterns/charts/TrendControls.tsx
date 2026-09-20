import { ChartToolbar } from "~/components/patterns/charts/ChartToolbar";
import { MetricSelect, type MetricOptionGroup } from "~/components/patterns/charts/MetricSelect";
import { Field } from "~/components/ui/field";
import { Segmented } from "~/components/ui/segmented";
import { useHydrated } from "~/hooks/useHydrated";
import { cn } from "~/lib/utils";

interface TrendMetricFieldProps extends Omit<
  React.ComponentProps<typeof Field>,
  "label" | "children" | "onChange" | "defaultValue"
> {
  value: string;
  groups: readonly MetricOptionGroup[];
  onValueChange?: (value: string) => void;
  label?: string;
}

/** The metric picker of a trend toolbar. */
export function TrendMetricField({
  value,
  groups,
  onValueChange,
  label = "Metric",
  className,
  ...props
}: TrendMetricFieldProps) {
  return (
    <Field label={label} orientation="horizontal" className={cn("w-full @sm:w-auto", className)} {...props}>
      <MetricSelect value={value} groups={groups} onValueChange={onValueChange} />
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

interface TrendControlsProps extends Omit<React.ComponentProps<typeof ChartToolbar>, "children"> {
  /** `TrendMetricField`, `TrendIntervalField` and any other toolbar field. */
  children?: React.ReactNode;
}

/** Compact, URL-state-agnostic controls shared by historical analytics charts. */
export function TrendControls({ title, label = "Trend controls", children, ...props }: TrendControlsProps) {
  return (
    <ChartToolbar title={title} label={label} {...props}>
      {children}
    </ChartToolbar>
  );
}
