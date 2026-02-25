import { useState } from "react";
import {
	DualRangeSlider,
	type DualRangeSliderProps,
} from "~/components/primitives/DualRangeSlider";
import { Label } from "~/components/ui/label";
import { cn } from "~/lib/utils";

export interface DurationRangeFilterProps extends DualRangeSliderProps {
	value: [number, number];
	onRangeChange: (range: [number, number]) => void;
	min?: number;
	max?: number;
	step?: number;
	labelText?: string;
}

export function TimeRangeFilter({
	value,
	onRangeChange,
	min,
	max,
	step = 60,
	labelText = "Time Range",
	...props
}: DurationRangeFilterProps) {
	const [internalRange, setInternalRange] = useState<[number, number]>(value);
	return (
		<div className="flex flex-col gap-4 w-42">
			<Label htmlFor="duration-range-slider" className="mb-2 block font-medium">
				{labelText}
			</Label>
			<DualRangeSlider
				id="duration-range-slider"
				min={min}
				max={max}
				step={step}
				value={internalRange}
				aria-label={labelText}
				onValueChange={(value) => setInternalRange([value[0], value[1]])}
				onValueCommit={(value) => onRangeChange([value[0], value[1]])}
				label={(value) => (
					<span
						className={cn(
							"text-sm text-nowrap",
							value === internalRange[0] ? "mr-4" : "ml-4",
						)}
					>
						{value !== undefined ? `${Math.floor(value / 60)}m` : ""}
					</span>
				)}
				labelPosition="bottom"
				{...props}
			/>
		</div>
	);
}
