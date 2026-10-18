import { use } from "react";

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
  /** The trigger's name outside a `Field`. Inside one the visible Field label names it, followed by the value. */
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
