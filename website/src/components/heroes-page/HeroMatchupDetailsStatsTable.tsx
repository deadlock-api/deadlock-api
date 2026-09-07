import { useQuery } from "@tanstack/react-query";
import type { AnalyticsHeroStats } from "deadlock_api_client";
import { useMemo } from "react";

import { HeroImage } from "~/components/HeroImage";
import { HeroName } from "~/components/HeroName";
import { LoadingLogo } from "~/components/LoadingLogo";
import { ProgressBarWithLabel } from "~/components/primitives/ProgressBar";
import type { GameMode } from "~/components/selectors/GameModeSelector";
import type { MatchMode } from "~/components/selectors/MatchModeSelector";
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

interface MatchupRow {
  heroId: number;
  matches: number;
  wins: number;
  relWinrate: number;
  prevRelWinrate: number | undefined;
}

function formatSignedPercent(value: number) {
  const percent = Math.round(value * 1000) / 10;
  return `${percent > 0 ? "+" : ""}${percent.toFixed(1)}%`;
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
  linkHeroes,
  sameLaneFilter,
  minHeroMatches,
  gameMode,
  matchMode,
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
  linkHeroes?: boolean;
  sameLaneFilter?: boolean;
  minHeroMatches?: number;
  gameMode?: GameMode;
  matchMode?: MatchMode;
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
    matchMode,
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
    matchMode,
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
    matchMode,
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
    matchMode,
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
    matchMode,
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
    matchMode,
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

  const synergyRows = useMemo(() => {
    const rows: MatchupRow[] = [];
    for (const synergy of synergyData || []) {
      if (synergy.hero_id1 !== heroId && synergy.hero_id2 !== heroId) continue;
      const otherHeroId = synergy.hero_id1 === heroId ? synergy.hero_id2 : synergy.hero_id1;
      rows.push({
        heroId: otherHeroId,
        matches: synergy.matches_played,
        wins: synergy.wins,
        relWinrate:
          synergy.wins / synergy.matches_played -
          (heroStatsMap[heroId]?.wins / heroStatsMap[heroId]?.matches +
            heroStatsMap[otherHeroId]?.wins / heroStatsMap[otherHeroId]?.matches) /
            2,
        prevRelWinrate: prevSynergyRelWinrateMap[heroId]?.[otherHeroId],
      });
    }
    rows.sort((a, b) => b.relWinrate - a.relWinrate);
    return rows;
  }, [heroId, synergyData, heroStatsMap, prevSynergyRelWinrateMap]);

  const counterRows = useMemo(() => {
    const rows: MatchupRow[] = [];
    for (const counter of counterData || []) {
      if (counter.hero_id !== heroId) continue;
      rows.push({
        heroId: counter.enemy_hero_id,
        matches: counter.matches_played,
        wins: counter.wins,
        relWinrate: counter.wins / counter.matches_played - heroStatsMap[heroId]?.wins / heroStatsMap[heroId]?.matches,
        prevRelWinrate: prevCounterRelWinrateMap[heroId]?.[counter.enemy_hero_id],
      });
    }
    rows.sort((a, b) => b.relWinrate - a.relWinrate);
    return rows;
  }, [heroId, counterData, heroStatsMap, prevCounterRelWinrateMap]);

  const isSynergy = stat === HeroMatchupDetailsStatsTableStat.SYNERGY;
  const rows = isSynergy ? synergyRows : counterRows;
  const relWinrates = rows.map((row) => row.relWinrate);
  const minRelWinrate = rows.length ? Math.min(...relWinrates) : 0;
  const maxRelWinrate = rows.length ? Math.max(...relWinrates) : 0;

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
          <TableHead className="whitespace-normal">
            {isSynergy ? "Combination (Win Rate Change)" : "Against (Win Rate Change)"}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, index) => (
          <TableRow
            key={row.heroId}
            className={cn(onHeroSelected && "cursor-pointer")}
            onClick={() => onHeroSelected?.(row.heroId)}
          >
            <TableCell>{index + 1}</TableCell>
            <TableCell>
              <div className="flex items-center gap-2">
                <HeroImage heroId={row.heroId} />
                {onHeroSelected ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onHeroSelected(row.heroId);
                    }}
                    className="cursor-pointer rounded-sm text-left outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  >
                    <HeroName heroId={row.heroId} />
                  </button>
                ) : (
                  <HeroName heroId={row.heroId} linkToDetail={linkHeroes} />
                )}
              </div>
            </TableCell>
            <TableCell>
              <ProgressBarWithLabel
                min={minRelWinrate}
                max={maxRelWinrate}
                value={row.relWinrate}
                color={isSynergy ? "#fa4454" : "#22d3ee"}
                label={formatSignedPercent(row.relWinrate)}
                delta={row.prevRelWinrate !== undefined ? row.relWinrate - row.prevRelWinrate : undefined}
                tooltip={
                  <div className="flex flex-col gap-1 text-xs">
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">Matches</span>
                      <span className="font-medium">{row.matches.toLocaleString("en-US")}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">Wins</span>
                      <span className="font-medium">{row.wins.toLocaleString("en-US")}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">Win rate change</span>
                      <span className="font-medium">
                        {row.relWinrate > 0 ? "+" : ""}
                        {(row.relWinrate * 100).toFixed(2)}%
                      </span>
                    </div>
                    {row.prevRelWinrate !== undefined && (
                      <div className="mt-0.5 flex justify-between gap-4 border-t border-border pt-1">
                        <span className="text-muted-foreground">Previous</span>
                        <span className="font-medium">
                          {row.prevRelWinrate > 0 ? "+" : ""}
                          {(row.prevRelWinrate * 100).toFixed(2)}%
                        </span>
                      </div>
                    )}
                  </div>
                }
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
