import { CalendarIcon } from "lucide-react";
import { useCallback, useMemo } from "react";
import type { DateRange } from "react-day-picker";

import { Button } from "~/components/ui/button";
import { Calendar } from "~/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
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

export interface DateRangePickerProps {
  startDate?: Dayjs;
  endDate?: Dayjs;
  onDateRangeChange: (range: { startDate?: Dayjs; endDate?: Dayjs }) => void;
  className?: string;
  startLabel?: string;
  endLabel?: string;
  /** When true, selections snap to full weeks (Monday–Sunday). */
  weekMode?: boolean;
}

export function DateRangePicker({ startDate, endDate, onDateRangeChange, className, weekMode }: DateRangePickerProps) {
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

  // Format the display text for the button
  const displayText = useMemo(() => {
    if (startDate && endDate) {
      return (
        <>
          {startDate.format("MMM DD, YYYY")} - {endDate.format("MMM DD, YYYY")}
        </>
      );
    }

    if (startDate) {
      return startDate.format("MMM DD, YYYY");
    }

    return <span>Select date range</span>;
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

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn("w-[300px] justify-between text-left font-normal", !startDate && "text-foreground")}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {displayText}
            <button
              type="button"
              onClick={() => handleDateRangeSelect()}
              aria-label="Reset date range"
              className="icon-[mdi--close] align-middle text-lg font-bold hover:text-red-500"
            />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto min-w-[30rem] p-2" align="start">
          <Calendar
            // eslint-disable-next-line jsx-a11y/no-autofocus -- calendar needs immediate focus for keyboard nav
            autoFocus={true}
            mode="range"
            defaultMonth={startDate?.toDate()}
            selected={dateRange}
            onSelect={handleDateRangeSelect}
            numberOfMonths={2}
            weekStartsOn={1}
            showWeekNumber={weekMode}
            className="w-full"
          />
          <div className="flex justify-center gap-2">
            {weekMode ? (
              <>
                <Button variant="outline" onClick={() => selectLastWeeks(1)}>
                  Last Week
                </Button>
                <Button variant="outline" onClick={() => selectLastWeeks(2)}>
                  Last 2 Weeks
                </Button>
                <Button variant="outline" onClick={() => selectLastWeeks(4)}>
                  Last 4 Weeks
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => selectLastDays(7)}>
                  Last 7 Days
                </Button>
                <Button variant="outline" onClick={() => selectLastDays(14)}>
                  Last 14 Days
                </Button>
                <Button variant="outline" onClick={() => selectLastDays(30)}>
                  Last 30 Days
                </Button>
              </>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
