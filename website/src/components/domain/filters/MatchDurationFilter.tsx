import {
  MatchTimeRangeSelector,
  type MatchTimeRangeSelectorProps,
} from "~/components/domain/selectors/MatchTimeRangeSelector";
import { MAX_GAME_DURATION_S } from "~/lib/constants";

const PRESETS = [
  { label: "Short (<20m)", start: 0, end: 20 * 60 },
  { label: "Mid (20-40m)", start: 20 * 60, end: 40 * 60 },
  { label: "Long (40m+)", start: 40 * 60, end: MAX_GAME_DURATION_S },
];

export function MatchDurationFilter(
  props: Pick<MatchTimeRangeSelectorProps, "value" | "defaultValue" | "onValueChange">,
) {
  return (
    <MatchTimeRangeSelector
      {...props}
      label="Duration"
      title="Match Duration"
      max={MAX_GAME_DURATION_S}
      presets={PRESETS}
    />
  );
}
