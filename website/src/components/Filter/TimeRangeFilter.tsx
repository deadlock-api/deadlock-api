import { MatchTimeRangeSelector } from "~/components/selectors/MatchTimeRangeSelector";

export function TimeRangeFilter({
  minTime,
  maxTime,
  onTimeChange,
  label = "Time",
  title = "Match Time Window",
  max,
  presets,
}: {
  minTime?: number;
  maxTime?: number;
  onTimeChange: (min: number | undefined, max: number | undefined) => void;
  label?: string;
  title?: string;
  max?: number;
  presets?: { label: string; start: number; end: number }[] | null;
}) {
  return (
    <MatchTimeRangeSelector
      minTime={minTime}
      maxTime={maxTime}
      onTimeChange={onTimeChange}
      label={label}
      title={title}
      max={max}
      presets={presets}
    />
  );
}
