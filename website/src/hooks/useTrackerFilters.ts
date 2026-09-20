import { parseAsInteger, parseAsString, parseAsStringLiteral, throttle, useQueryState, useQueryStates } from "nuqs";
import { useMemo } from "react";

import { parseAsGameMode } from "~/components/domain/selectors/GameModeSelector";
import { parseAsMatchMode } from "~/components/domain/selectors/MatchModeSelector";
import { MODE_CONFIG } from "~/components/domain/selectors/ModeSelector";
import { day } from "~/dayjs";
import { useDateRangeState } from "~/hooks/useDateRangeState";
import { useModeState } from "~/hooks/useModeState";
import { parseAsDayjsRange } from "~/lib/nuqs-parsers";
import type { ResultFilter, TrackerFilterValues } from "~/lib/tracker/compute";

export const TRACKER_TABS = ["matches", "heroes", "mates"] as const;
export type TrackerTab = (typeof TRACKER_TABS)[number];

const RESULT_FILTERS = ["all", "win", "loss"] as const;
const TRACKER_SELECTION_PARSERS = {
  hero: parseAsInteger,
  result: parseAsStringLiteral(RESULT_FILTERS).withDefault("all"),
  game_mode: parseAsGameMode,
  match_mode: parseAsMatchMode,
  date_range: parseAsDayjsRange,
  "pd-picker-tab": parseAsString,
  match: parseAsInteger,
};

export function useTrackerFilters() {
  const [tab, setTab] = useQueryState("tab", parseAsStringLiteral(TRACKER_TABS).withDefault("matches"));
  const { mode, setMode, gameMode, matchMode } = useModeState();
  const [heroId, setHeroId] = useQueryState("hero", parseAsInteger);
  const [result, setResult] = useQueryState("result", parseAsStringLiteral(RESULT_FILTERS).withDefault("all"));
  const { startDate, endDate, handleDateChange, defaultRange } = useDateRangeState();
  const [, setFilterQuery] = useQueryStates(TRACKER_SELECTION_PARSERS);
  // The picker already supplies day, season or patch boundaries. Rounding them to UTC days can
  // add matches outside a local calendar-day selection, so every tracker view uses the exact instants.
  const minUnixTimestamp = startDate?.unix();
  const maxUnixTimestamp = endDate?.unix();

  const applyFilters = (next: TrackerFilterValues, { clearMatch = false } = {}) => {
    const datesChanged =
      (next.minUnixTimestamp ?? null) !== (minUnixTimestamp ?? null) ||
      (next.maxUnixTimestamp ?? null) !== (maxUnixTimestamp ?? null);
    setFilterQuery(
      {
        hero: next.heroId,
        result: next.result,
        game_mode: MODE_CONFIG[next.mode].gameMode,
        match_mode: MODE_CONFIG[next.mode].matchMode,
        // An open range must be explicit: null would restore the current-season default instead.
        date_range: datesChanged
          ? [
              next.minUnixTimestamp == null ? undefined : day.unix(next.minUnixTimestamp),
              next.maxUnixTimestamp == null ? undefined : day.unix(next.maxUnixTimestamp),
            ]
          : undefined,
        "pd-picker-tab": datesChanged ? null : undefined,
        match: clearMatch ? null : undefined,
      },
      { history: "push", limitUrlUpdates: throttle(50) },
    );
  };

  const filters: TrackerFilterValues = useMemo(
    () => ({
      mode,
      heroId,
      minUnixTimestamp,
      maxUnixTimestamp,
      result: result as ResultFilter,
    }),
    [mode, heroId, minUnixTimestamp, maxUnixTimestamp, result],
  );

  return {
    tab,
    setTab,
    mode,
    setMode,
    gameMode,
    matchMode,
    heroId,
    setHeroId,
    result,
    setResult,
    startDate,
    endDate,
    handleDateChange,
    defaultRange,
    minUnixTimestamp,
    maxUnixTimestamp,
    filters,
    applyFilters,
  };
}
