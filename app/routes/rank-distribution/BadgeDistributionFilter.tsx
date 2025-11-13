import { fromUnixTime, getUnixTime } from "date-fns";
import type { AnalyticsApiBadgeDistributionRequest } from "deadlock-api-client/api";
import { useState } from "react";
import { DualRangeSlider } from "~/components/primitives/DualRangeSlider";
import { PatchOrDatePicker } from "~/components/primitives/PatchOrDatePicker";
import { Label } from "~/components/ui/label";
import { PATCHES } from "~/lib/consts";

const MIN_DURATION = 0;
const MAX_DURATION = 7000;

export interface BadgeDistributionFilterProps {
	filters: AnalyticsApiBadgeDistributionRequest;
	onFiltersChange: (filters: AnalyticsApiBadgeDistributionRequest) => void;
}

export default function BadgeDistributionFilter({
	filters,
	onFiltersChange,
}: BadgeDistributionFilterProps) {
	return (
		<div className="flex justify-center items-center w-full gap-8">
			<DurationRangeFilters
				durationRange={[
					filters.minDurationS ?? MIN_DURATION,
					filters.maxDurationS ?? MAX_DURATION,
				]}
				onDurationRangeChange={(range) =>
					onFiltersChange({
						...filters,
						minDurationS: range[0],
						maxDurationS: range[1],
					})
				}
			/>
			<PatchOrDatePicker
				patchDates={PATCHES}
				value={{
					startDate: filters.minUnixTimestamp
						? fromUnixTime(filters.minUnixTimestamp)
						: undefined,
					endDate: filters.maxUnixTimestamp
						? fromUnixTime(filters.maxUnixTimestamp)
						: undefined,
				}}
				onValueChange={({ startDate, endDate }) =>
					onFiltersChange({
						...filters,
						minUnixTimestamp: startDate ? getUnixTime(startDate) : undefined,
						maxUnixTimestamp: endDate ? getUnixTime(endDate) : undefined,
					})
				}
			/>
		</div>
	);
}

function DurationRangeFilters({
	durationRange,
	onDurationRangeChange,
}: {
	durationRange: [number, number];
	onDurationRangeChange: (range: [number, number]) => void;
}) {
	const [internalRange, setInternalRange] =
		useState<[number, number]>(durationRange);
	return (
		<div className="flex flex-col gap-4 w-42">
			<Label htmlFor="duration-range-slider" className="mb-2 block font-medium">
				Match Duration
			</Label>
			<DualRangeSlider
				id="duration-range-slider"
				min={MIN_DURATION}
				max={MAX_DURATION}
				step={60}
				value={internalRange}
				aria-label="Match Duration Range Slider"
				onValueChange={(value) => setInternalRange([value[0], value[1]])}
				onValueCommit={(value) => onDurationRangeChange([value[0], value[1]])}
				label={(value) => (
					<span className="text-sm text-nowrap">
						{value !== undefined ? `${Math.floor(value / 60)}m` : ""}
					</span>
				)}
				labelPosition="bottom"
			/>
		</div>
	);
}
