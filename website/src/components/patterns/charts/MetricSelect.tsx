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
  return (
    <Select disabled={!hydrated} value={value} onValueChange={onValueChange}>
      <SelectTrigger
        size="sm"
        aria-label={label}
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
