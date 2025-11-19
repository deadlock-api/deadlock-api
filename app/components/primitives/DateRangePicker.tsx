import { endOfDay, format, startOfDay, subDays } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { useCallback, useMemo } from "react";
import type { DateRange } from "react-day-picker";
import { Button } from "~/components/ui/button";
import { Calendar } from "~/components/ui/calendar";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "~/components/ui/popover";
import { cn } from "~/lib/utils";

export interface DateRangePickerProps {
	startDate?: Date;
	endDate?: Date;
	onDateRangeChange: (range: { startDate?: Date; endDate?: Date }) => void;
	className?: string;
	startLabel?: string;
	endLabel?: string;
}

export function DateRangePicker({
	startDate,
	endDate,
	onDateRangeChange,
	className,
}: DateRangePickerProps) {
	// Convert dayjs dates to Date objects for react-day-picker
	const dateRange: DateRange | undefined = useMemo(() => {
		if (!startDate && !endDate) return undefined;

		return { from: startDate, to: endDate };
	}, [startDate, endDate]);

	// Handle date selection from the calendar
	const handleDateRangeSelect = useCallback(
		(range?: DateRange) => {
			if (!range) {
				onDateRangeChange({});
				return;
			}

			// Convert Date objects to dayjs with appropriate time adjustments
			if (range.from && range.to) {
				onDateRangeChange({
					startDate: startOfDay(range.from),
					endDate: endOfDay(range.to),
				});
			} else if (range.from) {
				onDateRangeChange({ startDate: startOfDay(range.from) });
			} else if (range.to) {
				onDateRangeChange({ endDate: endOfDay(range.to) });
			}
		},
		[onDateRangeChange],
	);

	// Format the display text for the button
	const displayText = useMemo(() => {
		if (startDate && endDate) {
			return (
				<>
					{format(startDate, "MMM dd, yy")} - {format(endDate, "MMM dd, yy")}
				</>
			);
		}

		if (startDate) {
			return format(startDate, "MMM dd, yyyy");
		}

		return <span>Select date range</span>;
	}, [startDate, endDate]);

	function selectLastDays(days: number) {
		const startDate = startOfDay(subDays(new Date(), days));
		const endDate = endOfDay(new Date());
		onDateRangeChange({ startDate, endDate });
	}

	return (
		<div className={cn("flex flex-col gap-1.5", className)}>
			<Popover>
				<PopoverTrigger asChild>
					<Button
						variant="outline"
						className={cn(
							"w-[220px] justify-between text-left font-normal",
							!startDate && "text-foreground",
						)}
					>
						<CalendarIcon className="mr-2 h-4 w-4" />
						{displayText}
						<button
							type="button"
							onClick={() => handleDateRangeSelect()}
							aria-label="Reset date range"
							className="hover:text-red-500 font-bold text-lg align-middle icon-[mdi--close]"
						/>
					</Button>
				</PopoverTrigger>
				<PopoverContent className="w-auto min-w-120 p-2" align="start">
					<Calendar
						autoFocus={true}
						mode="range"
						defaultMonth={startDate}
						selected={dateRange}
						onSelect={handleDateRangeSelect}
						numberOfMonths={2}
						className="w-full"
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
