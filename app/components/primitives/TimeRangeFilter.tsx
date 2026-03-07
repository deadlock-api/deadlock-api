import { ClockIcon } from "lucide-react";
import { useState } from "react";
import { FilterPill } from "~/components/FilterPill";
import { DualRangeSlider, type DualRangeSliderProps } from "~/components/primitives/DualRangeSlider";
import { cn } from "~/lib/utils";

export interface DurationRangeFilterProps extends DualRangeSliderProps {
  value: [number, number];
  onRangeChange: (range: [number, number]) => void;
  min?: number;
  max?: number;
  step?: number;
  labelText?: string;
}

function formatMinutes(seconds: number) {
  return `${Math.floor(seconds / 60)}m`;
}

export function TimeRangeFilter({
  value,
  onRangeChange,
  min = 0,
  max = 3600,
  step = 60,
  labelText = "Duration",
  ...props
}: DurationRangeFilterProps) {
  const [internalRange, setInternalRange] = useState<[number, number]>(value);

  const isFullRange = value[0] === min && value[1] === max;
  const displayValue = isFullRange ? "Any" : `${formatMinutes(value[0])} - ${formatMinutes(value[1])}`;

  return (
    <FilterPill
      label={labelText}
      value={displayValue}
      active={!isFullRange}
      icon={<ClockIcon className="size-3.5 shrink-0" />}
      className="w-56 p-4"
    >
      <div className="grid gap-4">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{formatMinutes(internalRange[0])}</span>
          <span>{internalRange[1] === max ? "Max" : formatMinutes(internalRange[1])}</span>
        </div>
        <div className="pt-2 pb-2">
          <DualRangeSlider
            min={min}
            max={max}
            step={step}
            value={internalRange}
            aria-label={labelText}
            onValueChange={(v) => setInternalRange([v[0], v[1]])}
            onValueCommit={(v) => onRangeChange([v[0], v[1]])}
            className="[&_[role=slider]]:h-4 [&_[role=slider]]:w-4"
            {...props}
          />
        </div>
      </div>
    </FilterPill>
  );
}
