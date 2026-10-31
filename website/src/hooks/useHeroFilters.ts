import { parseAsBoolean, parseAsInteger, parseAsStringLiteral, useQueryState } from "nuqs";

import { useAnalyticsTab } from "~/hooks/useAnalyticsTab";
import { useDateRangeState } from "~/hooks/useDateRangeState";
import { useModeState } from "~/hooks/useModeState";
import type { AnalyticsTab } from "~/lib/analytics-tabs";
import { getEffectiveRankRange } from "~/lib/game-mode";
import { DEFAULT_RANK_RANGE } from "~/lib/rank-utils";
import { BY_RANK_STATS, HERO_STATS_WITH_RATES, heroStatIn, TIME_INTERVALS } from "~/types/api_hero_stats";

export const STATS_TABS: readonly HeroTab[] = [
  "stats",
  "tier-list",
  "stats-over-time",
  "stats-by-duration",
  "stats-by-rank",
  "stats-by-experience",
];

export type HeroTab = AnalyticsTab<"heroes">;

export function useHeroFilters() {
  const { mode, setMode, gameMode, matchMode } = useModeState();
  // The matchup and combo tabs leave out pairs with fewer shared matches; not a filter, the server prefetches ask for the
  // same minimum.
  const minMatches = 10;
  // The stats tabs count every hero, without a minimum of matches in the range or in total: the page's server
  // prefetches ask for the same 0, so their queries are the ones the tabs read.
  const minHeroMatches = 0;
  const minHeroMatchesTotal = 0;
  const [minRankId, setMinRankId] = useQueryState("min_rank", parseAsInteger.withDefault(DEFAULT_RANK_RANGE.min));
  const [maxRankId, setMaxRankId] = useQueryState("max_rank", parseAsInteger.withDefault(DEFAULT_RANK_RANGE.max));
  const [sameLaneFilter, setSameLaneFilter] = useQueryState("same_lane", parseAsBoolean.withDefault(true));
  const { startDate, endDate, prevStartDate, prevEndDate, handleDateChange, defaultRange } = useDateRangeState();
  const [tab, setTab] = useAnalyticsTab("heroes");
  const [heroId, setHeroId] = useQueryState("hero_id", parseAsInteger.withDefault(2));
  const [chosenHeroStat, setHeroStat] = useQueryState(
    "hero_stat",
    parseAsStringLiteral(HERO_STATS_WITH_RATES).withDefault("winrate"),
  );
  const [heroTimeInterval, setHeroTimeInterval] = useQueryState(
    "time_interval",
    parseAsStringLiteral(TIME_INTERVALS.map((interval) => interval.query)).withDefault("start_time_day"),
  );
  const [chosenByRankX, setByRankX] = useQueryState(
    "by_rank_x",
    parseAsStringLiteral(BY_RANK_STATS).withDefault("pickrate"),
  );
  const [chosenByRankY, setByRankY] = useQueryState(
    "by_rank_y",
    parseAsStringLiteral(BY_RANK_STATS).withDefault("winrate"),
  );
  // Street Brawl has no soul economy, so its pickers leave out net worth: one picked in another mode falls back here
  // instead of plotting under a picker that does not list it. The URL keeps the choice for when the mode changes back.
  const heroStat = heroStatIn(chosenHeroStat, gameMode, "winrate");
  const byRankX = heroStatIn(chosenByRankX, gameMode, "pickrate");
  const byRankY = heroStatIn(chosenByRankY, gameMode, "winrate");

  const { effectiveMinRankId, effectiveMaxRankId } = getEffectiveRankRange(mode, minRankId, maxRankId);

  return {
    mode,
    setMode,
    gameMode,
    matchMode,
    minMatches,
    minHeroMatches,
    minHeroMatchesTotal,
    minRankId,
    setMinRankId,
    maxRankId,
    setMaxRankId,
    sameLaneFilter,
    setSameLaneFilter,
    startDate,
    endDate,
    prevStartDate,
    prevEndDate,
    handleDateChange,
    defaultRange,
    tab,
    setTab,
    heroId,
    setHeroId,
    heroStat,
    setHeroStat,
    heroTimeInterval,
    setHeroTimeInterval,
    byRankX,
    setByRankX,
    byRankY,
    setByRankY,
    effectiveMinRankId,
    effectiveMaxRankId,
  };
}
