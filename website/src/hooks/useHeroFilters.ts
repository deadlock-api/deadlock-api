import { parseAsBoolean, parseAsInteger, parseAsStringLiteral, useQueryState } from "nuqs";

import { useAnalyticsTab } from "~/hooks/useAnalyticsTab";
import { useDateRangeState } from "~/hooks/useDateRangeState";
import { useModeState } from "~/hooks/useModeState";
import type { AnalyticsTab } from "~/lib/analytics-tabs";
import { getEffectiveRankRange } from "~/lib/game-mode";
import { BY_RANK_STATS, heroStatIn } from "~/types/api_hero_stats";
import { HERO_STATS_WITH_BAN_RATE } from "~/types/api_hero_stats";

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
  const [minMatches, setMinMatches] = useQueryState("min_matches", parseAsInteger.withDefault(10));
  const [minHeroMatches, setMinHeroMatches] = useQueryState("min_hero_matches", parseAsInteger.withDefault(0));
  const [minHeroMatchesTotal, setMinHeroMatchesTotal] = useQueryState(
    "min_hero_matches_total",
    parseAsInteger.withDefault(0),
  );
  const [minRankId, setMinRankId] = useQueryState("min_rank", parseAsInteger.withDefault(91));
  const [maxRankId, setMaxRankId] = useQueryState("max_rank", parseAsInteger.withDefault(116));
  const [sameLaneFilter, setSameLaneFilter] = useQueryState("same_lane", parseAsBoolean.withDefault(true));
  const { startDate, endDate, prevStartDate, prevEndDate, handleDateChange, defaultRange } = useDateRangeState();
  const [tab, setTab] = useAnalyticsTab("heroes");
  const [heroId, setHeroId] = useQueryState("hero_id", parseAsInteger.withDefault(2));
  const [chosenHeroStat, setHeroStat] = useQueryState(
    "hero_stat",
    parseAsStringLiteral(HERO_STATS_WITH_BAN_RATE).withDefault("winrate"),
  );
  const [heroTimeInterval, setHeroTimeInterval] = useQueryState(
    "time_interval",
    parseAsStringLiteral(["start_time_hour", "start_time_day", "start_time_week"] as const).withDefault(
      "start_time_day",
    ),
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
    setMinMatches,
    minHeroMatches,
    setMinHeroMatches,
    minHeroMatchesTotal,
    setMinHeroMatchesTotal,
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
