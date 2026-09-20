import { CalendarIcon, XIcon } from "lucide-react";
import { useCallback, useMemo } from "react";
import type { DateRange } from "react-day-picker";

import { Button } from "~/components/ui/button";
import { Calendar } from "~/components/ui/calendar";
import { useControllableState } from "~/components/ui/hooks/use-controllable-state";
import { Segmented, SegmentedItem } from "~/components/ui/segmented";
import type { Dayjs } from "~/dayjs";
import { day } from "~/dayjs";
import { cn } from "~/lib/utils";

/** Get the Monday of the week containing the given date. */
function getMonday(date: Date): Date {
  const d = new Date(date);
  const dayOfWeek = d.getDay();
  // getDay(): 0=Sun, 1=Mon, ..., 6=Sat → offset to Monday
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  d.setDate(d.getDate() + diff);
  return d;
}

/** Get the Sunday of the week containing the given date. */
function getSunday(date: Date): Date {
  const d = new Date(date);
  const dayOfWeek = d.getDay();
  const diff = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
  d.setDate(d.getDate() + diff);
  return d;
}

export interface DateRangeValue {
  startDate?: Dayjs;
  endDate?: Dayjs;
}

export interface DateRangePickerProps extends Omit<
  React.ComponentProps<"div">,
  "children" | "defaultValue" | "onChange"
> {
  /** An open end is a missing date; `{}` is no range at all. */
  value?: DateRangeValue;
  defaultValue?: DateRangeValue;
  onValueChange?: (value: DateRangeValue) => void;
  /** When true, selections snap to full weeks (Monday–Sunday). */
  weekMode?: boolean;
}

const DAY_PRESETS = [7, 14, 30];
const WEEK_PRESETS = [1, 2, 4];
const NO_RANGE: DateRangeValue = {};

export function DateRangePicker({
  value,
  defaultValue = NO_RANGE,
  onValueChange,
  weekMode = false,
  className,
  ...props
}: DateRangePickerProps) {
  const [{ startDate, endDate }, onDateRangeChange] = useControllableState<DateRangeValue>({
    value,
    defaultValue,
    onValueChange,
  });

  // Convert dayjs dates to Date objects for react-day-picker
  const dateRange: DateRange | undefined = useMemo(() => {
    if (!startDate && !endDate) return undefined;

    return {
      from: startDate?.toDate(),
      to: endDate?.toDate(),
    };
  }, [startDate, endDate]);

  // Handle date selection from the calendar
  const handleDateRangeSelect = useCallback(
    (range?: DateRange) => {
      if (!range) {
        onDateRangeChange({});
        return;
      }

      if (weekMode) {
        // In week mode, clicking any day selects the full Mon–Sun week
        const clicked = range.to ?? range.from;
        if (clicked) {
          onDateRangeChange({
            startDate: day(getMonday(clicked)).startOf("day"),
            endDate: day(getSunday(clicked)).endOf("day"),
          });
        }
        return;
      }

      // Convert Date objects to dayjs with appropriate time adjustments
      if (range.from && range.to) {
        onDateRangeChange({
          startDate: day(range.from).startOf("day"),
          endDate: day(range.to).endOf("day"),
        });
      } else if (range.from) {
        onDateRangeChange({ startDate: day(range.from).startOf("day") });
      } else if (range.to) {
        onDateRangeChange({ endDate: day(range.to).endOf("day") });
      }
    },
    [onDateRangeChange, weekMode],
  );

  const displayText = useMemo(() => {
    if (startDate && endDate) return `${startDate.format("MMM DD, YYYY")} - ${endDate.format("MMM DD, YYYY")}`;
    if (startDate) return `since ${startDate.format("MMM DD, YYYY")}`;
    if (endDate) return `until ${endDate.format("MMM DD, YYYY")}`;
    return "Select a date range";
  }, [startDate, endDate]);

  function selectLastDays(days: number) {
    let start = day().subtract(days, "day").startOf("day");
    let end = day().startOf("day");
    if (weekMode) {
      // Snap to week boundaries: start at previous Monday, end at next Sunday
      start = day(getMonday(start.toDate())).startOf("day");
      end = day(getSunday(end.toDate())).endOf("day");
    }
    onDateRangeChange({ startDate: start, endDate: end });
  }

  function selectLastWeeks(weeks: number) {
    // Select the last N complete weeks (Mon–Sun), ending with the most recent completed week
    const today = day();
    const lastSunday = day(getSunday(today.toDate()));
    // If today is Sunday, use this week's Sunday; otherwise use last Sunday
    const endWeekSunday = lastSunday.isAfter(today) ? lastSunday.subtract(7, "day") : lastSunday;
    const startMonday = endWeekSunday.subtract(weeks - 1, "week").subtract(6, "day");
    onDateRangeChange({
      startDate: startMonday.startOf("day"),
      endDate: endWeekSunday.endOf("day"),
    });
  }

  const presets = weekMode
    ? WEEK_PRESETS.map((n) => ({ value: String(n), label: n === 1 ? "Last week" : `Last ${n} weeks` }))
    : DAY_PRESETS.map((n) => ({ value: String(n), label: `Last ${n} days` }));

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
      <Calendar
        mode="range"
        defaultMonth={startDate?.toDate()}
        selected={dateRange}
        onSelect={handleDateRangeSelect}
        numberOfMonths={1}
        weekStartsOn={1}
        showWeekNumber={weekMode}
        className="mx-auto p-0"
      />
      <Segmented
        value=""
        onValueChange={(v) => (weekMode ? selectLastWeeks(Number(v)) : selectLastDays(Number(v)))}
        aria-label="Presets"
        className="flex-nowrap"
      >
        {presets.map((preset) => (
          <SegmentedItem key={preset.value} value={preset.value}>
            {preset.label}
          </SegmentedItem>
        ))}
      </Segmented>
    </div>
  );
}
