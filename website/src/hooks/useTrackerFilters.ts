import { parseAsInteger, parseAsStringLiteral, useQueryState } from "nuqs";
import { useMemo } from "react";

import { useDateRangeState } from "~/hooks/useDateRangeState";
import { useModeState } from "~/hooks/useModeState";
import type { ResultFilter, TrackerFilterValues } from "~/lib/tracker/compute";

export const TRACKER_TABS = ["matches", "heroes", "mates"] as const;
export type TrackerTab = (typeof TRACKER_TABS)[number];

const RESULT_FILTERS = ["all", "win", "loss"] as const;

export function useTrackerFilters() {
  const [tab, setTab] = useQueryState("tab", parseAsStringLiteral(TRACKER_TABS).withDefault("matches"));
  const { mode, setMode, gameMode, matchMode } = useModeState();
  const [heroId, setHeroId] = useQueryState("hero", parseAsInteger);
  const [result, setResult] = useQueryState("result", parseAsStringLiteral(RESULT_FILTERS).withDefault("all"));
  const { startDate, endDate, handleDateChange } = useDateRangeState();
  // The picker already supplies day, season or patch boundaries. Rounding them to UTC days can
  // add matches outside a local calendar-day selection, so every tracker view uses the exact instants.
  const minUnixTimestamp = startDate?.unix();
  const maxUnixTimestamp = endDate?.unix();

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
    minUnixTimestamp,
    maxUnixTimestamp,
    filters,
  };
}
