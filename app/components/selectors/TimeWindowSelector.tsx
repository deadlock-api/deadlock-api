import { ClockIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "~/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { Slider } from "~/components/ui/slider";
import { cn } from "~/lib/utils";

interface TimeWindowSelectorProps {
  minTime?: number;
  maxTime?: number;
  onTimeChange: (min: number | undefined, max: number | undefined) => void;
}

// 60 minutes max for the slider range
const MAX_SLIDER_TIME = 60 * 60;
const STEP = 60; // 1 minute step

export default function TimeWindowSelector({ minTime, maxTime, onTimeChange }: TimeWindowSelectorProps) {
  // Local state for the slider to allow smooth dragging
  // If minTime/maxTime are undefined, we default to 0 and MAX_SLIDER_TIME
  const [localValue, setLocalValue] = useState([minTime ?? 0, maxTime ?? MAX_SLIDER_TIME]);

  // Sync local state with props when they change (e.g. reset or external update)
  useEffect(() => {
    setLocalValue([minTime ?? 0, maxTime ?? MAX_SLIDER_TIME]);
  }, [minTime, maxTime]);

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m`;
  };

  const getLabel = () => {
    const [start, end] = localValue;
    const isStartZero = start === 0;
    const isEndMax = end === MAX_SLIDER_TIME;

    if (isStartZero && isEndMax) return "Any time";
    if (isStartZero) return `First ${formatTime(end)}`;
    if (isEndMax) return `After ${formatTime(start)}`;
    return `${formatTime(start)} - ${formatTime(end)}`;
  };

  const handleValueChange = (newValue: number[]) => {
    setLocalValue(newValue);
  };

  const handleValueCommit = (newValue: number[]) => {
    const [start, end] = newValue;
    // If start is 0, we treat it as undefined (no lower bound)
    // If end is MAX_SLIDER_TIME, we treat it as undefined (no upper bound)
    onTimeChange(start === 0 ? undefined : start, end === MAX_SLIDER_TIME ? undefined : end);
  };

  const setPreset = (start: number, end: number) => {
    const newValue = [start, end];
    setLocalValue(newValue);
    handleValueCommit(newValue);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center h-8">
        <span className="text-sm font-semibold text-foreground">Purchase Time</span>
      </div>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "w-[180px] justify-start text-left font-normal h-10",
              !minTime && !maxTime && "text-muted-foreground",
            )}
          >
            <ClockIcon className="mr-2 h-4 w-4" />
            <span className="truncate">{getLabel()}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-4" align="start">
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
                onValueChange={handleValueChange}
                onValueCommit={handleValueCommit}
                className="[&_[role=slider]]:h-4 [&_[role=slider]]:w-4"
              />
            </div>
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>{formatTime(localValue[0])}</span>
              <span>{localValue[1] === MAX_SLIDER_TIME ? "End of Game" : formatTime(localValue[1])}</span>
            </div>

            {/* Helper Shortcuts */}
            <div className="grid grid-cols-3 gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setPreset(0, 10 * 60)} className="text-xs px-2 h-8">
                Early (0-10m)
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPreset(10 * 60, 25 * 60)}
                className="text-xs px-2 h-8"
              >
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
        </PopoverContent>
      </Popover>
    </div>
  );
}
