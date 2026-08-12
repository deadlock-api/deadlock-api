import { useQueryState } from "nuqs";

import { parseAsGameMode } from "~/components/selectors/GameModeSelector";
import { type MatchMode, parseAsMatchMode } from "~/components/selectors/MatchModeSelector";
import { type Mode, MODE_CONFIG } from "~/components/selectors/ModeSelector";

const NORMAL_MODE_BY_MATCH_MODE: Record<MatchMode, Mode> = {
  "ranked,unranked": "normal_all",
  ranked: "normal_ranked",
  unranked: "normal_unranked",
};

/**
 * Backs the single Mode filter with the long-standing `game_mode` / `match_mode` search params, so
 * existing links keep working. The returned `gameMode`/`matchMode` are the canonical pair for the
 * selected mode, which normalizes combinations a hand-edited URL could otherwise ask for.
 */
export function useModeState() {
  const [gameModeParam, setGameMode] = useQueryState("game_mode", parseAsGameMode);
  const [matchModeParam, setMatchMode] = useQueryState("match_mode", parseAsMatchMode);

  const mode: Mode = gameModeParam === "street_brawl" ? "street_brawl" : NORMAL_MODE_BY_MATCH_MODE[matchModeParam];

  const setMode = (next: Mode) => {
    setGameMode(MODE_CONFIG[next].gameMode);
    setMatchMode(MODE_CONFIG[next].matchMode);
  };

  const { gameMode, matchMode } = MODE_CONFIG[mode];
  return { mode, setMode, gameMode, matchMode };
}
