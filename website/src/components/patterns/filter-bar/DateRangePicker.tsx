import { CalendarIcon, XIcon } from "lucide-react";
import { lazy, Suspense } from "react";
import type { DateRange } from "react-day-picker";

import { Button } from "~/components/ui/button";
import { useControllableState } from "~/components/ui/hooks/use-controllable-state";
import { Segmented, SegmentedItem } from "~/components/ui/segmented";
import { Skeleton } from "~/components/ui/skeleton";
import type { Dayjs } from "~/dayjs";
import { day } from "~/dayjs";
import { cn } from "~/lib/utils";

// The calendar (react-day-picker and date-fns, ~20 KB gzip) only shows once someone opens a custom range; statically
// imported, it rode along in the filters chunk of every filtered page.
const Calendar = lazy(() => import("~/components/ui/calendar").then((m) => ({ default: m.Calendar })));

interface DateRangeValue {
  startDate?: Dayjs;
  endDate?: Dayjs;
}

interface DateRangePickerProps extends Omit<React.ComponentProps<"div">, "children" | "defaultValue" | "onChange"> {
  /** An open end is a missing date; `{}` is no range at all. */
  value?: DateRangeValue;
  defaultValue?: DateRangeValue;
  onValueChange?: (value: DateRangeValue) => void;
}

/**
 * The quick ranges under the calendar. A day preset ends with today, like a range picked on the calendar (midnight
 * would drop today's matches east of UTC). The hour preset starts on the hour, so everyone asking within the same hour
 * shares one request, and stays open-ended up to now.
 */
const PRESETS = [
  { value: "24h", label: "Last 24h", range: () => ({ startDate: day().subtract(24, "hour").startOf("hour") }) },
  ...[7, 30].map((days) => ({
    value: `${days}d`,
    label: `Last ${days} days`,
    range: () => ({ startDate: day().subtract(days, "day").startOf("day"), endDate: day().endOf("day") }),
  })),
] satisfies { value: string; label: string; range: () => DateRangeValue }[];
const NO_RANGE: DateRangeValue = {};

export function DateRangePicker({
  value,
  defaultValue = NO_RANGE,
  onValueChange,
  className,
  ...props
}: DateRangePickerProps) {
  const [{ startDate, endDate }, onDateRangeChange] = useControllableState<DateRangeValue>({
    value,
    defaultValue,
    onValueChange,
  });

  // react-day-picker works in Date objects.
  const dateRange: DateRange | undefined =
    startDate || endDate ? { from: startDate?.toDate(), to: endDate?.toDate() } : undefined;

  // A picked range covers whole days: from the start of its first to the end of its last.
  function handleDateRangeSelect(range?: DateRange) {
    onDateRangeChange({
      ...(range?.from && { startDate: day(range.from).startOf("day") }),
      ...(range?.to && { endDate: day(range.to).endOf("day") }),
    });
  }

  // A start inside a day (the hour preset) shows its time: "since Oct 30" would read as the whole day.
  const formatStart = (date: Dayjs) =>
    date.format(date.valueOf() === date.startOf("day").valueOf() ? "MMM DD, YYYY" : "MMM DD, YYYY HH:mm");
  let displayText = "Select a date range";
  if (startDate && endDate) displayText = `${formatStart(startDate)} - ${endDate.format("MMM DD, YYYY")}`;
  else if (startDate) displayText = `since ${formatStart(startDate)}`;
  else if (endDate) displayText = `until ${endDate.format("MMM DD, YYYY")}`;

  function selectPreset(value: string) {
    const preset = PRESETS.find((candidate) => candidate.value === value);
    if (preset) onDateRangeChange(preset.range());
  }

  return (
    <div data-slot="date-range-picker" className={cn("flex flex-col gap-2", className)} {...props}>
      <div className="flex items-center justify-between gap-2 px-1 text-sm">
        <span className={cn("flex items-center gap-2", !startDate && !endDate && "text-muted-foreground")}>
          <CalendarIcon className="size-4 shrink-0" />
          {displayText}
        </span>
        {(startDate || endDate) && (
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Reset date range"
            className="text-muted-foreground"
            onClick={() => handleDateRangeSelect()}
          >
            <XIcon />
          </Button>
        )}
      </div>
      <Suspense fallback={<Skeleton className="mx-auto h-72 w-64" />}>
        <Calendar
          // A preset can start in another month: the calendar opens on the month the range starts in.
          key={startDate?.format("YYYY-MM")}
          mode="range"
          defaultMonth={startDate?.toDate()}
          selected={dateRange}
          onSelect={handleDateRangeSelect}
          numberOfMonths={1}
          weekStartsOn={1}
          className="mx-auto p-0"
        />
      </Suspense>
      <Segmented value="" onValueChange={selectPreset} aria-label="Presets" className="flex-nowrap">
        {PRESETS.map((preset) => (
          <SegmentedItem key={preset.value} value={preset.value}>
            {preset.label}
          </SegmentedItem>
        ))}
      </Segmented>
    </div>
  );
}
