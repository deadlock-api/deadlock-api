import { RankRangeSelector } from "~/components/selectors/RankRangeSelector";

import { createFilter } from "./createFilter";
import { formatRankRange, useRankLabel } from "./utils";

export const RankRangeFilter = createFilter<{
  minRank: number;
  maxRank: number;
  onRankChange: (min: number, max: number) => void;
  label?: string;
}>({
  useDescription(props) {
    const rankLabel = useRankLabel();
    return {
      rankRange: formatRankRange(props.minRank, props.maxRank, rankLabel),
    };
  },
  Render({ minRank, maxRank, onRankChange, label }) {
    return <RankRangeSelector minRank={minRank} maxRank={maxRank} onRankChange={onRankChange} label={label} />;
  },
});
