import { type Mode, MODE_CONFIG, ModeSelector } from "~/components/selectors/ModeSelector";
import { RankRangeSelector } from "~/components/selectors/RankRangeSelector";

export function ModeWithRankFilter({
  mode,
  onModeChange,
  minRank,
  maxRank,
  onRankChange,
  hideRankRange,
  defaultMinRank,
  defaultMaxRank,
}: {
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  minRank: number;
  maxRank: number;
  onRankChange: (min: number, max: number) => void;
  hideRankRange?: boolean;
  defaultMinRank?: number;
  defaultMaxRank?: number;
}) {
  return (
    <>
      <ModeSelector value={mode} onChange={onModeChange} />
      {!hideRankRange && MODE_CONFIG[mode].supportsRank && (
        <RankRangeSelector
          minRank={minRank}
          maxRank={maxRank}
          onRankChange={onRankChange}
          defaultMinRank={defaultMinRank}
          defaultMaxRank={defaultMaxRank}
        />
      )}
    </>
  );
}
