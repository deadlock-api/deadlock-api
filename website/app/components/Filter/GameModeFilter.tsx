import { formatGameMode } from "./utils";
import { type GameMode, GameModeSelector } from "~/components/selectors/GameModeSelector";

import { createFilter } from "./createFilter";

export const GameModeFilter = createFilter<{
  value: GameMode;
  onChange: (mode: GameMode) => void;
}>({
  useDescription(props) {
    return { gameMode: formatGameMode(props.value) };
  },
  Render({ value, onChange }) {
    return <GameModeSelector value={value} onChange={onChange} />;
  },
});
