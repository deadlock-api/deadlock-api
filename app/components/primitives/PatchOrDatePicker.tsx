import { endOfDay, isSameDay, startOfDay } from "date-fns";
import { CalendarIcon, ClockIcon } from "lucide-react";
import { useEffect, useId, useState } from "react";
import {
	DateRangePicker,
	type DateRangePickerProps,
} from "~/components/primitives/DateRangePicker";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";

type Tab = "patch" | "custom";

export interface PatchInfo {
	id: string; // Unique identifier for the patch
	name: string; // Display name, e.g., "Current Patch (05-08)"
	startDate: Date;
	endDate: Date; // Can be a specific date or "NOW"
}

export interface PatchOrDatePickerProps {
	patchDates: PatchInfo[];
	value: { startDate?: Date; endDate?: Date };
	onValueChange: (value: { startDate?: Date; endDate?: Date }) => void;
	defaultTab?: Tab;
}

export function PatchOrDatePicker({
	patchDates,
	value,
	onValueChange,
	defaultTab = "patch",
}: PatchOrDatePickerProps) {
	const [tab, setTab] = useState<Tab>(defaultTab);

	const patchSelectId = useId();

	const matchingPatch = patchDates.find((p) => {
		if (!value.startDate || !value.endDate) return false;
		return (
			isSameDay(p.startDate, value.startDate) &&
			isSameDay(p.endDate, value.endDate)
		);
	});

	useEffect(() => {
		if (matchingPatch) {
			if (tab !== "patch") {
				setTab("patch");
			}
		} else if (value.startDate || value.endDate) {
			// If dates are set but don't match a patch, switch to custom
			// Only switch if not already on custom to avoid loops if defaultTab was custom
			if (tab !== "custom") {
				setTab("custom");
			}
		} else {
			// If no dates are set, revert to defaultTab or stay if already there
			if (tab !== defaultTab) {
				setTab(defaultTab);
			}
		}
	}, []);

	const handlePatchSelect = (patchId: string) => {
		const selectedPatch = patchDates.find((p) => p.id === patchId);
		if (selectedPatch) {
			onValueChange({
				startDate: selectedPatch.startDate,
				endDate: selectedPatch.endDate,
			});
		} else {
			// Handle case where "Select a patch" or an empty value is chosen
			onValueChange({});
		}
	};

	const handleDateRangePickerChange: DateRangePickerProps["onDateRangeChange"] =
		(range) => {
			onValueChange({
				startDate: range.startDate ? startOfDay(range.startDate) : undefined,
				endDate: range.endDate ? endOfDay(range.endDate) : undefined,
			});
		};

	return (
		<div className="flex flex-col gap-1.5">
			<div className="flex items-center justify-between gap-2">
				<div className="flex items-center h-8">
					<span className="text-sm text-foreground font-semibold">Time</span>
				</div>
				<Tabs
					defaultValue={defaultTab}
					value={tab}
					onValueChange={(value) => setTab(value as "patch" | "custom")}
				>
					<TabsList className="flex h-8">
						<TabsTrigger
							value="patch"
							className="text-xs flex items-center gap-1"
						>
							<ClockIcon className="h-3 w-3" />
							Patch
						</TabsTrigger>
						<TabsTrigger
							value="custom"
							className="text-xs flex items-center gap-1"
						>
							<CalendarIcon className="h-3 w-3" />
							Custom
						</TabsTrigger>
					</TabsList>
				</Tabs>
			</div>

			<div>
				{tab === "patch" ? (
					<Select
						value={matchingPatch?.id || ""}
						onValueChange={handlePatchSelect}
					>
						<SelectTrigger
							id={patchSelectId}
							className="h-10 focus-visible:ring-0 w-[220px]"
						>
							<SelectValue placeholder="Select a patch..." />
						</SelectTrigger>
						<SelectContent>
							{patchDates.map((patch) => (
								<SelectItem key={patch.id} value={patch.id}>
									{patch.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				) : (
					<DateRangePicker
						startDate={value.startDate}
						endDate={value.endDate}
						onDateRangeChange={handleDateRangePickerChange}
					/>
				)}
			</div>
		</div>
	);
}
