import { useState } from "react";
import { DualRangeSlider } from "~/components/primitives/DualRangeSlider";
import { Label } from "~/components/ui/label";

export const MIN_DURATION = 0;
export const MAX_DURATION = 7000;

export function DurationRangeFilter({
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
