import { use } from "react";

import { FilterRootContext, FilterToggleCell } from "~/components/patterns/filter-bar/FilterCell";
import { Field } from "~/components/ui/field";
import { Segmented } from "~/components/ui/segmented";
import { useHydrated } from "~/hooks/useHydrated";

interface TrendIntervalFieldProps extends Omit<
  React.ComponentProps<typeof Field>,
  "label" | "onChange" | "defaultValue"
> {
  value: string;
  onValueChange?: (value: string) => void;
  label?: string;
}

/** The bucket picker of a trend chart; its options are disabled until the client has hydrated. */
export function TrendIntervalField({
  value,
  onValueChange,
  label = "Group by",
  children,
  ...props
}: TrendIntervalFieldProps) {
  const hydrated = useHydrated();
  // In a page's filter row: a chip like every other filter there.
  if (use(FilterRootContext)) {
    return (
      <FilterToggleCell label={label} value={value} onValueChange={onValueChange} disabled={!hydrated}>
        {children}
      </FilterToggleCell>
    );
  }
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
