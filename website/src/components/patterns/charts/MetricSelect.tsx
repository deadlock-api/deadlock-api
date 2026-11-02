import { use } from "react";

import { FILTER_CHIP, FilterRootContext } from "~/components/patterns/filter-bar/FilterCell";
import { FieldLabelContext } from "~/components/ui/hooks/use-field-control";
import { Select, SelectContent, SelectTrigger, SelectValue } from "~/components/ui/select";
import { useHydrated } from "~/hooks/useHydrated";
import { cn } from "~/lib/utils";

interface MetricSelectProps extends Omit<React.ComponentProps<typeof SelectTrigger>, "value" | "onChange"> {
  value: string;
  /**
   * The selected option in words. The options are not mounted while the list is closed, so the trigger cannot
   * read it from them during SSR.
   */
  valueLabel?: string;
  onValueChange?: (value: string) => void;
  /**
   * The control's name: shown inside the chip in a filter row; outside a `Field` elsewhere, its accessible name. Inside a
   * Field the visible Field label names it.
   */
  label?: string;
  /** `SelectItem`s, bare or inside `SelectGroup`s with a `SelectLabel`. */
  children?: React.ReactNode;
}

/** Grouped metrics keep large option sets accessible without wrapping into several toolbar rows. */
export function MetricSelect({
  value,
  valueLabel = value,
  onValueChange,
  label = "Trend metric",
  className,
  children,
  ...props
}: MetricSelectProps) {
  const hydrated = useHydrated();
  // An aria-label would replace the visible Field label as the name ("Metric" on screen, "Trend metric" read out).
  const inField = use(FieldLabelContext) != null;
  // In a page's filter row it is a chip like every filter there: its label, then the chosen metric.
  if (use(FilterRootContext)) {
    return (
      <Select disabled={!hydrated} value={value} onValueChange={onValueChange}>
        <SelectTrigger size="sm" title={valueLabel} className={cn(FILTER_CHIP, className)} {...props}>
          <span data-slot="filter-cell-label" className="type-caption font-normal text-muted-foreground">
            {label}
          </span>
          <SelectValue>{valueLabel}</SelectValue>
        </SelectTrigger>
        <SelectContent>{children}</SelectContent>
      </Select>
    );
  }
  return (
    <Select disabled={!hydrated} value={value} onValueChange={onValueChange}>
      <SelectTrigger
        size="sm"
        aria-label={inField ? undefined : label}
        title={valueLabel}
        className={cn("w-full min-w-0 @sm:w-auto @sm:max-w-72 @sm:min-w-52", className)}
        {...props}
      >
        <SelectValue>{valueLabel}</SelectValue>
      </SelectTrigger>
      <SelectContent>{children}</SelectContent>
    </Select>
  );
}
