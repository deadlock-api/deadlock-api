import { useQuery } from "@tanstack/react-query";
import type { AnalyticsHeroStats, HeroCounterStats, HeroSynergyStats } from "deadlock_api_client";
import { useMemo } from "react";

import { HeroImage } from "~/components/HeroImage";
import { HeroName } from "~/components/HeroName";
import { LoadingLogo } from "~/components/LoadingLogo";
import { ProgressBarWithLabel } from "~/components/primitives/ProgressBar";
import type { GameMode } from "~/components/selectors/GameModeSelector";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { CACHE_DURATIONS } from "~/constants/cache";
import type { Dayjs } from "~/dayjs";
import { useNormalizedTimeRange } from "~/hooks/useNormalizedTimeRange";
import { api } from "~/lib/api";
import { cn } from "~/lib/utils";
import { queryKeys } from "~/queries/query-keys";

export enum HeroMatchupDetailsStatsTableStat {
  SYNERGY = 0,
  COUNTER = 1,
}

function buildHeroStatsMap(data: AnalyticsHeroStats[] | undefined): Record<number, AnalyticsHeroStats> {
  const map: Record<number, AnalyticsHeroStats> = {};
  for (const hero of data || []) {
    map[hero.hero_id] = hero;
  }
  return map;
}

export function HeroMatchupDetailsStatsTable({
  heroId,
  stat,
  minRankId,
  maxRankId,
  minDate,
  maxDate,
  prevMinDate,
  prevMaxDate,
  onHeroSelected,
  sameLaneFilter,
  minHeroMatches,
  gameMode,
}: {
  heroId: number;
  stat: HeroMatchupDetailsStatsTableStat;
  minRankId?: number;
  maxRankId?: number;
  minDate?: Dayjs;
  maxDate?: Dayjs;
  prevMinDate?: Dayjs;
  prevMaxDate?: Dayjs;
  onHeroSelected?: (heroId: number) => void;
  sameLaneFilter?: boolean;
  minHeroMatches?: number;
  gameMode?: GameMode;
}) {
  const { minUnixTimestamp, maxUnixTimestamp } = useNormalizedTimeRange(minDate, maxDate);
  const { minUnixTimestamp: prevMinTimestamp, maxUnixTimestamp: prevMaxTimestamp } = useNormalizedTimeRange(
    prevMinDate,
    prevMaxDate,
  );

  const heroStatsQuery = {
    minHeroMatches: minHeroMatches ?? 0,
    minAverageBadge: minRankId,
    maxAverageBadge: maxRankId,
    minUnixTimestamp: minUnixTimestamp ?? 0,
    maxUnixTimestamp,
    gameMode: gameMode,
  };
  const { data: heroData, isLoading: isLoadingHero } = useQuery({
    queryKey: queryKeys.analytics.heroStats(heroStatsQuery),
    queryFn: async () => {
      const response = await api.analytics_api.heroStats(heroStatsQuery);
      return response.data;
    },
    staleTime: CACHE_DURATIONS.ONE_DAY,
  });

  const synergyStatsQuery = {
    sameLaneFilter: sameLaneFilter,
    minMatches: minHeroMatches ?? 0,
    minAverageBadge: minRankId,
    maxAverageBadge: maxRankId,
    minUnixTimestamp: minUnixTimestamp ?? 0,
    maxUnixTimestamp,
    gameMode: gameMode,
  };
  const { data: synergyData, isLoading: isLoadingSynergy } = useQuery({
    queryKey: queryKeys.analytics.heroSynergyStats(synergyStatsQuery),
    queryFn: async () => {
      const response = await api.analytics_api.heroSynergiesStats(synergyStatsQuery);
      return response.data;
    },
    staleTime: CACHE_DURATIONS.ONE_HOUR,
  });

  const counterStatsQuery = {
    sameLaneFilter: sameLaneFilter,
    minMatches: minHeroMatches ?? 0,
    minAverageBadge: minRankId,
    maxAverageBadge: maxRankId,
    minUnixTimestamp: minUnixTimestamp ?? 0,
    maxUnixTimestamp,
    gameMode: gameMode,
  };
  const { data: counterData, isLoading: isLoadingCounter } = useQuery({
    queryKey: queryKeys.analytics.heroCounterStats(counterStatsQuery),
    queryFn: async () => {
      const response = await api.analytics_api.heroCountersStats(counterStatsQuery);
      return response.data;
    },
    staleTime: CACHE_DURATIONS.ONE_HOUR,
  });

  const hasPreviousInterval = prevMinDate != null && prevMaxDate != null;

  const prevHeroStatsQuery = {
    minHeroMatches: minHeroMatches ?? 0,
    minAverageBadge: minRankId,
    maxAverageBadge: maxRankId,
    minUnixTimestamp: prevMinTimestamp ?? 0,
    maxUnixTimestamp: prevMaxTimestamp,
    gameMode: gameMode,
  };
  const { data: prevHeroData } = useQuery({
    queryKey: queryKeys.analytics.heroStats(prevHeroStatsQuery),
    queryFn: async () => {
      const response = await api.analytics_api.heroStats(prevHeroStatsQuery);
      return response.data;
    },
    staleTime: CACHE_DURATIONS.ONE_DAY,
    enabled: hasPreviousInterval,
  });

  const prevSynergyStatsQuery = {
    sameLaneFilter: sameLaneFilter,
    minMatches: minHeroMatches ?? 0,
    minAverageBadge: minRankId,
    maxAverageBadge: maxRankId,
    minUnixTimestamp: prevMinTimestamp ?? 0,
    maxUnixTimestamp: prevMaxTimestamp,
    gameMode: gameMode,
  };
  const { data: prevSynergyData } = useQuery({
    queryKey: queryKeys.analytics.heroSynergyStats(prevSynergyStatsQuery),
    queryFn: async () => {
      const response = await api.analytics_api.heroSynergiesStats(prevSynergyStatsQuery);
      return response.data;
    },
    staleTime: CACHE_DURATIONS.ONE_HOUR,
    enabled: hasPreviousInterval,
  });

  const prevCounterStatsQuery = {
    sameLaneFilter: sameLaneFilter,
    minMatches: minHeroMatches ?? 0,
    minAverageBadge: minRankId,
    maxAverageBadge: maxRankId,
    minUnixTimestamp: prevMinTimestamp ?? 0,
    maxUnixTimestamp: prevMaxTimestamp,
    gameMode: gameMode,
  };
  const { data: prevCounterData } = useQuery({
    queryKey: queryKeys.analytics.heroCounterStats(prevCounterStatsQuery),
    queryFn: async () => {
      const response = await api.analytics_api.heroCountersStats(prevCounterStatsQuery);
      return response.data;
    },
    staleTime: CACHE_DURATIONS.ONE_HOUR,
    enabled: hasPreviousInterval,
  });

  const isLoading = useMemo(
    () => isLoadingSynergy || isLoadingCounter || isLoadingHero,
    [isLoadingSynergy, isLoadingCounter, isLoadingHero],
  );

  const heroStatsMap = useMemo(() => buildHeroStatsMap(heroData), [heroData]);
  const prevHeroStatsMap = useMemo(() => buildHeroStatsMap(prevHeroData), [prevHeroData]);

  const prevSynergyRelWinrateMap = useMemo(() => {
    const map: Record<number, Record<number, number>> = {};
    for (const synergy of prevSynergyData || []) {
      if (!synergy?.matches_played || !synergy?.wins) continue;
      if (!prevHeroStatsMap[synergy.hero_id1]?.matches || !prevHeroStatsMap[synergy.hero_id2]?.matches) continue;
      const relWinrate =
        synergy.wins / synergy.matches_played -
        (prevHeroStatsMap[synergy.hero_id1].wins / prevHeroStatsMap[synergy.hero_id1].matches +
          prevHeroStatsMap[synergy.hero_id2].wins / prevHeroStatsMap[synergy.hero_id2].matches) /
          2;
      if (!map[synergy.hero_id1]) map[synergy.hero_id1] = {};
      if (!map[synergy.hero_id2]) map[synergy.hero_id2] = {};
      map[synergy.hero_id1][synergy.hero_id2] = relWinrate;
      map[synergy.hero_id2][synergy.hero_id1] = relWinrate;
    }
    return map;
  }, [prevSynergyData, prevHeroStatsMap]);

  const prevCounterRelWinrateMap = useMemo(() => {
    const map: Record<number, Record<number, number>> = {};
    for (const counter of prevCounterData || []) {
      if (!counter?.matches_played || !counter?.wins) continue;
      if (!prevHeroStatsMap[counter.hero_id]?.matches) continue;
      const relWinrate =
        counter.wins / counter.matches_played -
        prevHeroStatsMap[counter.hero_id].wins / prevHeroStatsMap[counter.hero_id].matches;
      if (!map[counter.hero_id]) map[counter.hero_id] = {};
      map[counter.hero_id][counter.enemy_hero_id] = relWinrate;
    }
    return map;
  }, [prevCounterData, prevHeroStatsMap]);

  const heroSynergies = useMemo(() => {
    const synergies: (Pick<HeroSynergyStats, "hero_id1" | "hero_id2" | "wins" | "matches_played"> & {
      rel_winrate: number;
      prev_rel_winrate: number | undefined;
    })[] = [];
    for (const synergy of synergyData || []) {
      if (synergy.hero_id1 === heroId) {
        synergies.push({
          ...synergy,
          rel_winrate:
            synergy?.wins / synergy.matches_played -
            (heroStatsMap[synergy.hero_id1]?.wins / heroStatsMap[synergy.hero_id1]?.matches +
              heroStatsMap[synergy.hero_id2]?.wins / heroStatsMap[synergy.hero_id2]?.matches) /
              2,
          prev_rel_winrate: prevSynergyRelWinrateMap[synergy.hero_id1]?.[synergy.hero_id2],
        });
      }
      if (synergy.hero_id2 === heroId) {
        synergies.push({
          hero_id1: synergy.hero_id2,
          hero_id2: synergy.hero_id1,
          wins: synergy?.wins,
          matches_played: synergy.matches_played,
          rel_winrate:
            synergy?.wins / synergy.matches_played -
            (heroStatsMap[synergy.hero_id1]?.wins / heroStatsMap[synergy.hero_id1]?.matches +
              heroStatsMap[synergy.hero_id2]?.wins / heroStatsMap[synergy.hero_id2]?.matches) /
              2,
          prev_rel_winrate: prevSynergyRelWinrateMap[synergy.hero_id2]?.[synergy.hero_id1],
        });
      }
    }
    synergies.sort((a, b) => b.rel_winrate - a.rel_winrate);
    return synergies;
  }, [heroId, synergyData, heroStatsMap, prevSynergyRelWinrateMap]);

  const minSynergyWinrate = useMemo(() => {
    if (heroSynergies.length === 0) return 0;
    return Math.min(...heroSynergies.map((synergy) => synergy.rel_winrate));
  }, [heroSynergies]);

  const maxSynergyWinrate = useMemo(() => {
    if (heroSynergies.length === 0) return 0;
    return Math.max(...heroSynergies.map((synergy) => synergy.rel_winrate));
  }, [heroSynergies]);

  const heroCounters = useMemo(() => {
    const counters: (HeroCounterStats & { rel_winrate: number; prev_rel_winrate: number | undefined })[] = [];
    for (const counter of counterData || []) {
      if (counter.hero_id === heroId) {
        counters.push({
          ...counter,
          rel_winrate:
            counter?.wins / counter?.matches_played -
            heroStatsMap[counter.hero_id]?.wins / heroStatsMap[counter.hero_id]?.matches,
          prev_rel_winrate: prevCounterRelWinrateMap[counter.hero_id]?.[counter.enemy_hero_id],
        });
      }
    }
    counters.sort((a, b) => b.wins / b.matches_played - a.wins / a.matches_played);
    return counters;
  }, [heroId, counterData, heroStatsMap, prevCounterRelWinrateMap]);

  const minCounterWinrate = useMemo(() => {
    if (heroCounters.length === 0) return 0;
    return Math.min(...heroCounters.map((counter) => counter.rel_winrate));
  }, [heroCounters]);

  const maxCounterWinrate = useMemo(() => {
    if (heroCounters.length === 0) return 0;
    return Math.max(...heroCounters.map((counter) => counter.rel_winrate));
  }, [heroCounters]);

  function zip<T, U>(a: T[], b: U[]): [T, U][] {
    const length = Math.min(a.length, b.length);
    const result: [T, U][] = [];
    for (let i = 0; i < length; i++) {
      result.push([a[i], b[i]]);
    }
    return result;
  }

  if (isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center py-16">
        <LoadingLogo />
      </div>
    );
  }

  return (
    <Table>
      <TableHeader className="bg-muted">
        <TableRow>
          <TableHead className="text-center">#</TableHead>
          <TableHead>Hero</TableHead>
          {stat === HeroMatchupDetailsStatsTableStat.SYNERGY && <TableHead>Combination (Win Rate Change)</TableHead>}
          {stat === HeroMatchupDetailsStatsTableStat.COUNTER && <TableHead>Against (Win Rate Change)</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {zip(heroSynergies, heroCounters).map(([synergy, counter], index) => (
          <TableRow
            key={stat === HeroMatchupDetailsStatsTableStat.SYNERGY ? synergy.hero_id2 : counter.enemy_hero_id}
            className={cn(onHeroSelected && "cursor-pointer")}
            onClick={() =>
              onHeroSelected?.(
                stat === HeroMatchupDetailsStatsTableStat.SYNERGY ? synergy.hero_id2 : counter.enemy_hero_id,
              )
            }
          >
            <TableCell>{index + 1}</TableCell>
            <TableCell>
              <div className="flex items-center gap-2">
                {stat === HeroMatchupDetailsStatsTableStat.SYNERGY && (
                  <>
                    <HeroImage heroId={synergy.hero_id2} />
                    <HeroName heroId={synergy.hero_id2} />
                  </>
                )}
                {stat === HeroMatchupDetailsStatsTableStat.COUNTER && (
                  <>
                    <HeroImage heroId={counter.enemy_hero_id} />
                    <HeroName heroId={counter.enemy_hero_id} />
                  </>
                )}
              </div>
            </TableCell>
            {stat === HeroMatchupDetailsStatsTableStat.SYNERGY && (
              <TableCell>
                <ProgressBarWithLabel
                  min={minSynergyWinrate}
                  max={maxSynergyWinrate}
                  value={synergy.rel_winrate}
                  color={"#fa4454"}
                  label={`${synergy?.rel_winrate > 0 ? "+" : ""}${Math.round(synergy?.rel_winrate * 100).toFixed(0)}% `}
                  delta={
                    synergy.prev_rel_winrate !== undefined ? synergy.rel_winrate - synergy.prev_rel_winrate : undefined
                  }
                  tooltip={
                    <div className="flex flex-col gap-1 text-xs">
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">Matches</span>
                        <span className="font-medium">{synergy.matches_played.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">Wins</span>
                        <span className="font-medium">{synergy?.wins.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">Win rate change</span>
                        <span className="font-medium">
                          {synergy?.rel_winrate > 0 ? "+" : ""}
                          {(synergy?.rel_winrate * 100).toFixed(2)}%
                        </span>
                      </div>
                      {synergy.prev_rel_winrate !== undefined && (
                        <div className="mt-0.5 flex justify-between gap-4 border-t border-border pt-1">
                          <span className="text-muted-foreground">Previous</span>
                          <span className="font-medium">
                            {synergy.prev_rel_winrate > 0 ? "+" : ""}
                            {(synergy.prev_rel_winrate * 100).toFixed(2)}%
                          </span>
                        </div>
                      )}
                    </div>
                  }
                />
              </TableCell>
            )}
            {stat === HeroMatchupDetailsStatsTableStat.COUNTER && (
              <TableCell>
                <ProgressBarWithLabel
                  min={minCounterWinrate}
                  max={maxCounterWinrate}
                  value={counter.rel_winrate}
                  color={"#22d3ee"}
                  label={`${counter?.rel_winrate > 0 ? "+" : ""}${Math.round(counter?.rel_winrate * 100).toFixed(0)}% `}
                  delta={
                    counter.prev_rel_winrate !== undefined ? counter.rel_winrate - counter.prev_rel_winrate : undefined
                  }
                  tooltip={
                    <div className="flex flex-col gap-1 text-xs">
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">Matches</span>
                        <span className="font-medium">{counter?.matches_played.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">Wins</span>
                        <span className="font-medium">{counter?.wins.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">Win rate change</span>
                        <span className="font-medium">
                          {counter?.rel_winrate > 0 ? "+" : ""}
                          {(counter?.rel_winrate * 100).toFixed(2)}%
                        </span>
                      </div>
                      {counter.prev_rel_winrate !== undefined && (
                        <div className="mt-0.5 flex justify-between gap-4 border-t border-border pt-1">
                          <span className="text-muted-foreground">Previous</span>
                          <span className="font-medium">
                            {counter.prev_rel_winrate > 0 ? "+" : ""}
                            {(counter.prev_rel_winrate * 100).toFixed(2)}%
                          </span>
                        </div>
                      )}
                    </div>
                  }
                />
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
