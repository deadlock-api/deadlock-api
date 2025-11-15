import { fromUnixTime, getUnixTime } from "date-fns";
import type { AnalyticsApiBadgeDistributionRequest } from "deadlock-api-client/api";
import { useState } from "react";
import { DualRangeSlider } from "~/components/primitives/DualRangeSlider";
import {
	DurationRangeFilter,
	MAX_DURATION,
	MIN_DURATION,
} from "~/components/primitives/DurationRangeFilter";
import { PatchOrDatePicker } from "~/components/primitives/PatchOrDatePicker";
import { Label } from "~/components/ui/label";
import { PATCHES } from "~/lib/consts";

export interface BadgeDistributionFilterProps {
	value: AnalyticsApiBadgeDistributionRequest;
	onChange: (filter: AnalyticsApiBadgeDistributionRequest) => void;
}

export default function BadgeDistributionFilter({
	value,
	onChange,
}: BadgeDistributionFilterProps) {
	return (
		<div className="flex justify-center items-center w-full gap-8">
			<DurationRangeFilter
				durationRange={[
					value.minDurationS ?? MIN_DURATION,
					value.maxDurationS ?? MAX_DURATION,
				]}
				onDurationRangeChange={(range) =>
					onChange({
						...value,
						minDurationS: range[0],
						maxDurationS: range[1],
					})
				}
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
				onValueChange={({ startDate, endDate }) =>
					onChange({
						...value,
						minUnixTimestamp: startDate ? getUnixTime(startDate) : undefined,
						maxUnixTimestamp: endDate ? getUnixTime(endDate) : undefined,
					})
				}
			/>
		</div>
	);
}
