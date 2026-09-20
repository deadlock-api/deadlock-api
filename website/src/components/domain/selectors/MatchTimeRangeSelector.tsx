import { ClockIcon } from "lucide-react";

import { FilterCell } from "~/components/patterns/filter-bar/FilterCell";
import { Heading } from "~/components/ui/heading";
import { useControllableState } from "~/components/ui/hooks/use-controllable-state";
import { Segmented, SegmentedItem } from "~/components/ui/segmented";
import { Slider } from "~/components/ui/slider";
import { useDraftValue } from "~/hooks/useDraftValue";

/** `[from, to]` in seconds; `undefined` on a side leaves it open. */
export type MatchTimeRange = readonly [number | undefined, number | undefined];

const ANY_TIME: MatchTimeRange = [undefined, undefined];

export interface MatchTimeRangeSelectorProps extends Omit<
  React.ComponentProps<typeof FilterCell>,
  "label" | "value" | "defaultValue" | "active" | "onReset" | "icon" | "children" | "title"
> {
  value?: MatchTimeRange;
  defaultValue?: MatchTimeRange;
  onValueChange?: (value: MatchTimeRange) => void;
  /** Cell label. @default "Time" */
  label?: string;
  /** Popover heading. @default "Match Time Window" */
  title?: string;
  /** Max slider value in seconds. @default 3600 */
  max?: number;
  presets?: { label: string; start: number; end: number }[];
}

const DEFAULT_MAX = 60 * 60;
const STEP = 60;

const DEFAULT_PRESETS = [
  { label: "Early (0-10m)", start: 0, end: 10 * 60 },
  { label: "Mid (10-25m)", start: 10 * 60, end: 25 * 60 },
  { label: "Late (25m+)", start: 25 * 60, end: DEFAULT_MAX },
];

function formatTime(seconds: number) {
  return `${Math.floor(seconds / 60)}m`;
}

export function MatchTimeRangeSelector({
  value: valueProp,
  defaultValue = ANY_TIME,
  onValueChange,
  label = "Time",
  title = "Match Time Window",
  max = DEFAULT_MAX,
  presets = DEFAULT_PRESETS,
  className,
  ...props
}: MatchTimeRangeSelectorProps) {
  const [[minTime, maxTime], setValue] = useControllableState<MatchTimeRange>({
    value: valueProp,
    defaultValue,
    onValueChange,
  });
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
    setValue([start === 0 ? undefined : start, end === max ? undefined : end]);
  };

  const isActive = minTime != null || maxTime != null;
  const activePreset = presets.find((p) => p.start === committedValue[0] && p.end === committedValue[1])?.label ?? "";

  return (
    <FilterCell
      label={label}
      value={getLabel()}
      active={isActive}
      onReset={() => setValue(ANY_TIME)}
      icon={<ClockIcon className="size-3.5 shrink-0" />}
      className={className}
      contentClassName="w-80 p-4"
      {...props}
    >
      <div className="grid gap-4">
        <Heading as="h4" className="leading-none">
          {title}
        </Heading>
        <div className="pt-6 pb-2">
          <Slider
            thumbLabels={[`Minimum ${title.toLowerCase()}`, `Maximum ${title.toLowerCase()}`]}
            defaultValue={[0, max]}
            value={draftValue}
            min={0}
            max={max}
            step={STEP}
            minStepsBetweenThumbs={1}
            onValueChange={(newValue) => setDraftValue([newValue[0] ?? 0, newValue[1] ?? max])}
            onValueCommit={handleValueCommit}
          />
        </div>
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{formatTime(draftValue[0])}</span>
          <span>{draftValue[1] === max ? "End of Game" : formatTime(draftValue[1])}</span>
        </div>

        {presets.length > 0 && (
          <Segmented
            value={activePreset}
            onValueChange={(name) => {
              const preset = presets.find((p) => p.label === name);
              if (preset) handleValueCommit([preset.start, preset.end]);
            }}
            className="flex-nowrap"
          >
            {presets.map((p) => (
              <SegmentedItem key={p.label} value={p.label}>
                {p.label}
              </SegmentedItem>
            ))}
          </Segmented>
        )}
      </div>
    </FilterCell>
  );
}
