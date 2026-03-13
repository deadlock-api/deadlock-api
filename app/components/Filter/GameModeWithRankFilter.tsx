import { formatGameMode, formatRankRange, useRankLabel } from "./utils";
import { type GameMode, GameModeSelector } from "~/components/selectors/GameModeSelector";
import { RankRangeSelector } from "~/components/selectors/RankRangeSelector";

import { createFilter } from "./createFilter";

export const GameModeWithRankFilter = createFilter<{
  gameMode: GameMode;
  onGameModeChange: (mode: GameMode) => void;
  minRank: number;
  maxRank: number;
  onRankChange: (min: number, max: number) => void;
}>({
  useDescription(props) {
    const rankLabel = useRankLabel();
    const isStreetBrawl = props.gameMode === "street_brawl";
    return {
      gameMode: formatGameMode(props.gameMode),
      rankRange: isStreetBrawl ? null : formatRankRange(props.minRank, props.maxRank, rankLabel),
    };
  },
  Render({ gameMode, onGameModeChange, minRank, maxRank, onRankChange }) {
    const isStreetBrawl = gameMode === "street_brawl";
    return (
      <>
        <GameModeSelector value={gameMode} onChange={onGameModeChange} />
        {!isStreetBrawl && <RankRangeSelector minRank={minRank} maxRank={maxRank} onRankChange={onRankChange} />}
      </>
    );
  },
});
