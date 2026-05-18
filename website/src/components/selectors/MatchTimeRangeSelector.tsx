import { ClockIcon } from "lucide-react";

import { FilterPill } from "~/components/FilterPill";
import { Button } from "~/components/ui/button";
import { Slider } from "~/components/ui/slider";
import { useDraftValue } from "~/hooks/useDraftValue";

export interface MatchTimeRangeSelectorProps {
  minTime?: number;
  maxTime?: number;
  onTimeChange: (min: number | undefined, max: number | undefined) => void;
  /** FilterPill label. @default "Time" */
  label?: string;
  /** Popover heading. @default "Match Time Window" */
  title?: string;
  /** Popover description. @default "Filter by when events occurred in the match." */
  description?: string;
  /** Label shown when the slider end is at max. @default "End of Game" */
  maxLabel?: string;
  /** Max slider value in seconds. @default 3600 */
  max?: number;
  /** Slider step in seconds. @default 60 */
  step?: number;
  /** Preset buttons. Pass `null` to hide presets entirely. */
  presets?: { label: string; start: number; end: number }[] | null;
}

const DEFAULT_MAX = 60 * 60;
const DEFAULT_STEP = 60;

const DEFAULT_PRESETS = [
  { label: "Early (0-10m)", start: 0, end: 10 * 60 },
  { label: "Mid (10-25m)", start: 10 * 60, end: 25 * 60 },
  { label: "Late (25m+)", start: 25 * 60, end: DEFAULT_MAX },
];

function formatTime(seconds: number) {
  return `${Math.floor(seconds / 60)}m`;
}

export function MatchTimeRangeSelector({
  minTime,
  maxTime,
  onTimeChange,
  label = "Time",
  title = "Match Time Window",
  description = "Filter by when events occurred in the match.",
  maxLabel = "End of Game",
  max = DEFAULT_MAX,
  step = DEFAULT_STEP,
  presets = DEFAULT_PRESETS,
}: MatchTimeRangeSelectorProps) {
  const committedValue: [number, number] = [minTime ?? 0, maxTime ?? max];
  const [draftValue, setDraftValue] = useDraftValue(committedValue);

  const getLabel = () => {
    const isStartZero = (minTime ?? 0) === 0;
    const isEndMax = (maxTime ?? max) === max;

    if (isStartZero && isEndMax) return "Any";
    if (isStartZero) return `First ${formatTime(maxTime!)}`;
    if (isEndMax) return `After ${formatTime(minTime!)}`;
    return `${formatTime(minTime!)} - ${formatTime(maxTime!)}`;
  };

  const handleValueCommit = (newValue: number[]) => {
    const [start, end] = [newValue[0] ?? 0, newValue[1] ?? max];
    onTimeChange(start === 0 ? undefined : start, end === max ? undefined : end);
  };

  const isActive = minTime != null || maxTime != null;

  return (
    <FilterPill
      label={label}
      value={getLabel()}
      active={isActive}
      icon={<ClockIcon className="size-3.5 shrink-0" />}
      className="w-80 p-4"
    >
      <div className="grid gap-4">
        <div className="space-y-2">
          <h4 className="leading-none font-medium">{title}</h4>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="pt-6 pb-2">
          <Slider
            defaultValue={[0, max]}
            value={draftValue}
            min={0}
            max={max}
            step={step}
            minStepsBetweenThumbs={1}
            onValueChange={(newValue) => setDraftValue([newValue[0] ?? 0, newValue[1] ?? max])}
            onValueCommit={handleValueCommit}
            className="[&_[role=slider]]:h-4 [&_[role=slider]]:w-4"
          />
        </div>
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{formatTime(draftValue[0])}</span>
          <span>{draftValue[1] === max ? maxLabel : formatTime(draftValue[1])}</span>
        </div>

        {presets && presets.length > 0 && (
          <div className="grid grid-cols-3 gap-2 pt-2">
            {presets.map((preset) => (
              <Button
                key={preset.label}
                variant="outline"
                size="sm"
                onClick={() => handleValueCommit([preset.start, preset.end])}
                className="h-8 px-2 text-xs"
              >
                {preset.label}
              </Button>
            ))}
          </div>
        )}
      </div>
    </FilterPill>
  );
}
