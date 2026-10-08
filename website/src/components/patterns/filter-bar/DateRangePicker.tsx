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

const DAY_PRESETS = [7, 14, 30];
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

  let displayText = "Select a date range";
  if (startDate && endDate) displayText = `${startDate.format("MMM DD, YYYY")} - ${endDate.format("MMM DD, YYYY")}`;
  else if (startDate) displayText = `since ${startDate.format("MMM DD, YYYY")}`;
  else if (endDate) displayText = `until ${endDate.format("MMM DD, YYYY")}`;

  function selectLastDays(days: number) {
    // Ends with today, like a range picked on the calendar; midnight would drop today's matches east of UTC.
    onDateRangeChange({ startDate: day().subtract(days, "day").startOf("day"), endDate: day().endOf("day") });
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
          mode="range"
          defaultMonth={startDate?.toDate()}
          selected={dateRange}
          onSelect={handleDateRangeSelect}
          numberOfMonths={1}
          weekStartsOn={1}
          className="mx-auto p-0"
        />
      </Suspense>
      <Segmented value="" onValueChange={(v) => selectLastDays(Number(v))} aria-label="Presets" className="flex-nowrap">
        {DAY_PRESETS.map((days) => (
          <SegmentedItem key={days} value={String(days)}>
            Last {days} days
          </SegmentedItem>
        ))}
      </Segmented>
    </div>
  );
}
