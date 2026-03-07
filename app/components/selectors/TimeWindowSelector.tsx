import { ClockIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { FilterPill } from "~/components/FilterPill";
import { Button } from "~/components/ui/button";
import { Slider } from "~/components/ui/slider";

interface TimeWindowSelectorProps {
  minTime?: number;
  maxTime?: number;
  onTimeChange: (min: number | undefined, max: number | undefined) => void;
}

const MAX_SLIDER_TIME = 60 * 60;
const STEP = 60;

export default function TimeWindowSelector({ minTime, maxTime, onTimeChange }: TimeWindowSelectorProps) {
  const [localValue, setLocalValue] = useState([minTime ?? 0, maxTime ?? MAX_SLIDER_TIME]);

  useEffect(() => {
    setLocalValue([minTime ?? 0, maxTime ?? MAX_SLIDER_TIME]);
  }, [minTime, maxTime]);

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m`;
  };

  const getLabel = () => {
    const isStartZero = (minTime ?? 0) === 0;
    const isEndMax = (maxTime ?? MAX_SLIDER_TIME) === MAX_SLIDER_TIME;

    if (isStartZero && isEndMax) return "Any";
    if (isStartZero) return `First ${formatTime(maxTime!)}`;
    if (isEndMax) return `After ${formatTime(minTime!)}`;
    return `${formatTime(minTime!)} - ${formatTime(maxTime!)}`;
  };

  const handleValueCommit = (newValue: number[]) => {
    const [start, end] = newValue;
    onTimeChange(start === 0 ? undefined : start, end === MAX_SLIDER_TIME ? undefined : end);
  };

  const setPreset = (start: number, end: number) => {
    const newValue = [start, end];
    setLocalValue(newValue);
    handleValueCommit(newValue);
  };

  const isActive = minTime != null || maxTime != null;

  return (
    <FilterPill
      label="Time"
      value={getLabel()}
      active={isActive}
      icon={<ClockIcon className="size-3.5 shrink-0" />}
      className="w-80 p-4"
    >
      <div className="grid gap-4">
        <div className="space-y-2">
          <h4 className="font-medium leading-none">Purchase Time Window</h4>
          <p className="text-sm text-muted-foreground">Filter items by when they were purchased in the match.</p>
        </div>
        <div className="pt-6 pb-2">
          <Slider
            defaultValue={[0, MAX_SLIDER_TIME]}
            value={localValue}
            min={0}
            max={MAX_SLIDER_TIME}
            step={STEP}
            minStepsBetweenThumbs={1}
            onValueChange={setLocalValue}
            onValueCommit={handleValueCommit}
            className="[&_[role=slider]]:h-4 [&_[role=slider]]:w-4"
          />
        </div>
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{formatTime(localValue[0])}</span>
          <span>{localValue[1] === MAX_SLIDER_TIME ? "End of Game" : formatTime(localValue[1])}</span>
        </div>

        <div className="grid grid-cols-3 gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={() => setPreset(0, 10 * 60)} className="text-xs px-2 h-8">
            Early (0-10m)
          </Button>
          <Button variant="outline" size="sm" onClick={() => setPreset(10 * 60, 25 * 60)} className="text-xs px-2 h-8">
            Mid (10-25m)
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPreset(25 * 60, MAX_SLIDER_TIME)}
            className="text-xs px-2 h-8"
          >
            Late (25m+)
          </Button>
        </div>
      </div>
    </FilterPill>
  );
}
