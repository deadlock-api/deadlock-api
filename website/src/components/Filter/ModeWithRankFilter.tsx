import { type Mode, MODE_CONFIG, ModeSelector } from "~/components/selectors/ModeSelector";
import { RankRangeSelector } from "~/components/selectors/RankRangeSelector";

import { createFilter } from "./createFilter";
import { formatRankRange, useRankLabel } from "./utils";

export const ModeWithRankFilter = createFilter<{
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  minRank: number;
  maxRank: number;
  onRankChange: (min: number, max: number) => void;
  hideRankRange?: boolean;
}>({
  useDescription(props) {
    const rankLabel = useRankLabel();
    const showRank = !props.hideRankRange && MODE_CONFIG[props.mode].supportsRank;
    return {
      mode: MODE_CONFIG[props.mode].label,
      rankRange: showRank ? formatRankRange(props.minRank, props.maxRank, rankLabel) : null,
    };
  },
  Render({ mode, onModeChange, minRank, maxRank, onRankChange, hideRankRange }) {
    return (
      <>
        <ModeSelector value={mode} onChange={onModeChange} />
        {!hideRankRange && MODE_CONFIG[mode].supportsRank && (
          <RankRangeSelector minRank={minRank} maxRank={maxRank} onRankChange={onRankChange} />
        )}
      </>
    );
  },
});
