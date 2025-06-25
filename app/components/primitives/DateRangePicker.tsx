import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { useCallback, useMemo } from "react";
import type { DateRange } from "react-day-picker";
import { Button } from "~/components/ui/button";
import { Calendar } from "~/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import type { Dayjs } from "~/dayjs";
import { day } from "~/dayjs";
import { cn } from "~/lib/utils";

export interface DateRangePickerProps {
  startDate: Dayjs | null;
  endDate: Dayjs | null;
  onDateRangeChange: (range: { startDate: Dayjs | null; endDate: Dayjs | null }) => void;
  className?: string;
  startLabel?: string;
  endLabel?: string;
}

export function DateRangePicker({ startDate, endDate, onDateRangeChange, className }: DateRangePickerProps) {
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
    (range: DateRange | undefined) => {
      if (!range) {
        onDateRangeChange({ startDate: null, endDate: null });
        return;
      }

      // Convert Date objects to dayjs with appropriate time adjustments
      const newStartDate = range.from ? day(range.from).startOf("day") : null;
      const newEndDate = range.to ? day(range.to).endOf("day") : null;

      onDateRangeChange({ startDate: newStartDate, endDate: newEndDate });
    },
    [onDateRangeChange],
  );

  // Format the display text for the button
  const displayText = useMemo(() => {
    if (startDate && endDate) {
      return (
        <>
          {format(startDate.toDate(), "MMM dd, yyyy")} - {format(endDate.toDate(), "MMM dd, yyyy")}
        </>
      );
    }

    if (startDate) {
      return format(startDate.toDate(), "MMM dd, yyyy");
    }

    return <span>Select date range</span>;
  }, [startDate, endDate]);

  function selectLastDays(days: number) {
    const startDate = day().subtract(days, "day").startOf("day");
    const endDate = day().startOf("day");
    onDateRangeChange({ startDate, endDate });
  }

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn("w-[300px] justify-evenly font-normal", !startDate && "text-foreground")}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {displayText}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2" align="start">
          <Calendar
            initialFocus
            mode="range"
            defaultMonth={startDate?.toDate()}
            selected={dateRange}
            onSelect={handleDateRangeSelect}
            numberOfMonths={2}
          />
          <div className="flex justify-center gap-2">
            <Button variant="outline" onClick={() => selectLastDays(7)}>
              Last 7 Days
            </Button>
            <Button variant="outline" onClick={() => selectLastDays(14)}>
              Last 14 Days
            </Button>
            <Button variant="outline" onClick={() => selectLastDays(30)}>
              Last 30 Days
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
