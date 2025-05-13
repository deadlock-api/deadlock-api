import { endOfDay, format, startOfDay } from "date-fns";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import { CalendarIcon } from "lucide-react";
import * as React from "react";
import { Button } from "~/components/ui/button";
import { Calendar } from "~/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { cn } from "~/lib/utils";

export default function DatePicker({
  onDateSelected,
  selectedDate,
  label,
  type = "start",
}: {
  onDateSelected: (selectedDate: Dayjs | null) => void;
  selectedDate?: Dayjs | null;
  label?: string;
  type?: "start" | "end";
}) {
  const handleDateSelect = React.useCallback(
    (date: Date | undefined) => {
      if (!date) {
        onDateSelected(null);
        return;
      }

      // Convert to dayjs, then adjust the time based on type
      const adjustedDate = type === "start" ? dayjs(startOfDay(date)) : dayjs(endOfDay(date));

      onDateSelected(adjustedDate);
    },
    [type, onDateSelected],
  );

  const displayLabel = label || (type === "start" ? "Start Date" : "End Date");
  const placeholder = type === "start" ? "Select start date..." : "Select end date...";
  const timeNote = type === "start" ? "(12:00 AM)" : "(11:59 PM)";

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline gap-2">
        <span className="text-sm text-foreground">{displayLabel}</span>
        <span className="text-xs text-muted-foreground">{timeNote}</span>
      </div>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn("w-[200px] justify-start text-left font-normal", !selectedDate && "text-foreground")}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {selectedDate ? format(selectedDate.toDate(), "PPP") : <span>{placeholder}</span>}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar mode="single" selected={selectedDate?.toDate()} onSelect={handleDateSelect} initialFocus />
        </PopoverContent>
      </Popover>
    </div>
  );
}
