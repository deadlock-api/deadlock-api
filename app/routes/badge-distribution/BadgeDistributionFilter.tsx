import { fromUnixTime, getUnixTime } from "date-fns";
import type { AnalyticsApiBadgeDistributionRequest } from "deadlock-api-client/api";
import { useCallback } from "react";
import { PatchOrDatePicker } from "~/components/primitives/PatchOrDatePicker";
import { TimeRangeFilter } from "~/components/primitives/TimeRangeFilter";
import { PATCHES } from "~/lib/consts";

export interface BadgeDistributionFilterProps {
	value: AnalyticsApiBadgeDistributionRequest;
	onChange: (filter: AnalyticsApiBadgeDistributionRequest) => void;
}

export default function BadgeDistributionFilter({
	value,
	onChange,
}: BadgeDistributionFilterProps) {
	const handleDurationRangeChange = useCallback(
		(range: [number, number]) =>
			onChange({
				...value,
				minDurationS: range[0],
				maxDurationS: range[1],
			}),
		[onChange, value],
	);

	const handleDateChange = useCallback(
		({ startDate, endDate }: { startDate?: Date; endDate?: Date }) =>
			onChange({
				...value,
				minUnixTimestamp: startDate ? getUnixTime(startDate) : undefined,
				maxUnixTimestamp: endDate ? getUnixTime(endDate) : undefined,
			}),
		[onChange, value],
	);

	return (
		<div className="flex flex-wrap justify-center items-center w-full gap-8">
			<TimeRangeFilter
				value={[value.minDurationS ?? 0, value.maxDurationS ?? 7000]}
				min={0}
				max={7000}
				onRangeChange={handleDurationRangeChange}
				labelText="Match Duration"
			/>
			<PatchOrDatePicker
				patchDates={PATCHES}
				value={{
					startDate: value.minUnixTimestamp
						? fromUnixTime(value.minUnixTimestamp)
						: undefined,
					endDate: value.maxUnixTimestamp
						? fromUnixTime(value.maxUnixTimestamp)
						: undefined,
				}}
				onValueChange={handleDateChange}
			/>
		</div>
	);
}
