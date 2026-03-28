import { MatchTimeRangeSelector } from "~/components/selectors/MatchTimeRangeSelector";

import { createFilter } from "./createFilter";
import { formatTimeRange } from "./utils";

export const TimeRangeFilter = createFilter<{
  minTime?: number;
  maxTime?: number;
  onTimeChange: (min: number | undefined, max: number | undefined) => void;
  label?: string;
  title?: string;
  description?: string;
  max?: number;
  presets?: { label: string; start: number; end: number }[] | null;
}>({
  useDescription(props) {
    return {
      timeRange: formatTimeRange(props.minTime, props.maxTime, 0, props.max),
    };
  },
  Render({
    minTime,
    maxTime,
    onTimeChange,
    label = "Time",
    title = "Match Time Window",
    description = "Filter by when events occurred in the match.",
    max,
    presets,
  }) {
    return (
      <MatchTimeRangeSelector
        minTime={minTime}
        maxTime={maxTime}
        onTimeChange={onTimeChange}
        label={label}
        title={title}
        description={description}
        max={max}
        presets={presets}
      />
    );
  },
});
