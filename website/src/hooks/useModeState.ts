import { type Options, throttle, useQueryStates } from "nuqs";
import { startTransition } from "react";

import {
  DEFAULT_MODE,
  type Mode,
  MODE_CONFIG,
  modeFromParams,
  MODES,
  parseAsGameMode,
  parseAsMatchMode,
  parseAsTrackerMatchMode,
  TRACKER_DEFAULT_MODE,
  TRACKER_MODES,
} from "~/lib/game-mode";

/**
 * Backs the single Mode filter with the long-standing `game_mode` / `match_mode` search params, so
 * existing links keep working. The returned `gameMode`/`matchMode` are the canonical pair for the
 * selected mode, which normalizes combinations a hand-edited URL could otherwise ask for. The tracker
 * (`scope: "tracker"`) also offers All and starts there; the analytics pages start in Ranked.
 */
export function useModeState({ scope = "analytics" }: { scope?: "analytics" | "tracker" } = {}) {
  const tracker = scope === "tracker";
  const [{ game_mode: gameModeParam, match_mode: matchModeParam }, setModeParams] = useQueryStates({
    game_mode: parseAsGameMode,
    match_mode: tracker ? parseAsTrackerMatchMode : parseAsMatchMode,
  });

  const mode: Mode = tracker
    ? modeFromParams(gameModeParam, matchModeParam, TRACKER_MODES, TRACKER_DEFAULT_MODE)
    : modeFromParams(gameModeParam, matchModeParam, MODES, DEFAULT_MODE);

  const setMode = (next: Mode, options?: Options) => {
    // One choice updates both parameters together, without the app's per-key debounce splitting browser history.
    // The page re-renders in a transition, so the tap paints first (a synchronous re-render cost ~150 ms of INP on
    // phones). A debounced update would defeat that: nuqs tracks queued values in a sync external store.
    startTransition(() => {
      void setModeParams(
        { game_mode: MODE_CONFIG[next].gameMode, match_mode: MODE_CONFIG[next].matchMode },
        { ...options, limitUrlUpdates: options?.limitUrlUpdates ?? throttle(50) },
      );
    });
  };

  const { gameMode, matchMode } = MODE_CONFIG[mode];
  return { mode, setMode, gameMode, matchMode };
}
