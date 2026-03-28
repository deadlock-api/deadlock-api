import { MatchTimeRangeSelector } from "~/components/selectors/MatchTimeRangeSelector";
import { MAX_GAME_DURATION_S } from "~/lib/constants";

import { createFilter } from "./createFilter";
import { formatTimeRange } from "./utils";

export const MatchDurationFilter = createFilter<{
  minTime?: number;
  maxTime?: number;
  onTimeChange: (min: number | undefined, max: number | undefined) => void;
}>({
  useDescription(props) {
    return {
      duration: formatTimeRange(props.minTime, props.maxTime, 0, MAX_GAME_DURATION_S),
    };
  },
  Render({ minTime, maxTime, onTimeChange }) {
    return (
      <MatchTimeRangeSelector
        minTime={minTime}
        maxTime={maxTime}
        onTimeChange={onTimeChange}
        label="Duration"
        title="Match Duration"
        description="Filter matches by their total duration."
        max={MAX_GAME_DURATION_S}
        presets={[
          { label: "Short (<20m)", start: 0, end: 20 * 60 },
          { label: "Mid (20-40m)", start: 20 * 60, end: 40 * 60 },
          {
            label: "Long (40m+)",
            start: 40 * 60,
            end: MAX_GAME_DURATION_S,
          },
        ]}
      />
    );
  },
});
