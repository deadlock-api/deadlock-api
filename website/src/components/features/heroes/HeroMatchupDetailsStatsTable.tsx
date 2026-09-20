import { useQuery } from "@tanstack/react-query";
import type { AnalyticsHeroStats } from "deadlock_api_client";
import { useMemo } from "react";

import { HeroCell } from "~/components/domain/assets/HeroCell";
import { HeroImage } from "~/components/domain/assets/HeroImage";
import { HeroName } from "~/components/domain/assets/HeroName";
import type { GameMode } from "~/components/domain/selectors/GameModeSelector";
import type { MatchMode } from "~/components/domain/selectors/MatchModeSelector";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { Button } from "~/components/ui/button";
import { Delta } from "~/components/ui/delta";
import { ProgressBarWithLabel } from "~/components/ui/progress-bar";
import { Inline } from "~/components/ui/stack";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { TooltipStat, TooltipStats } from "~/components/ui/tooltip";
import { CACHE_DURATIONS } from "~/constants/cache";
import type { Dayjs } from "~/dayjs";
import { useNormalizedTimeRange } from "~/hooks/useNormalizedTimeRange";
import { api } from "~/lib/api";
import { formatSignedPercent } from "~/lib/format";
import { matchupWinRateChange } from "~/lib/matchup-stats";
import { queryKeys } from "~/queries/query-keys";

export enum HeroMatchupDetailsStatsTableStat {
  SYNERGY = 0,
  COUNTER = 1,
}

export interface MatchupRow {
  heroId: number;
  matches: number;
  wins: number;
  relWinrate: number;
  prevRelWinrate: number | undefined;
}

function buildHeroStatsMap(data: AnalyticsHeroStats[] | undefined): Record<number, AnalyticsHeroStats> {
  const map: Record<number, AnalyticsHeroStats> = {};
  for (const hero of data || []) {
    map[hero.hero_id] = hero;
  }
  return map;
}

export interface HeroMatchupParams {
  heroId: number;
  minRankId?: number;
  maxRankId?: number;
  minDate?: Dayjs;
  maxDate?: Dayjs;
  prevMinDate?: Dayjs;
  prevMaxDate?: Dayjs;
  sameLaneFilter?: boolean;
  minHeroMatches?: number;
  gameMode?: GameMode;
  matchMode?: MatchMode;
}

/** Teammate and opponent rows for `heroId`, each sorted from the biggest win rate gain to the biggest loss. */
export function useHeroMatchupRows({
  heroId,
  minRankId,
  maxRankId,
  minDate,
  maxDate,
  prevMinDate,
  prevMaxDate,
  sameLaneFilter,
  minHeroMatches,
  gameMode,
  matchMode,
}: HeroMatchupParams) {
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
  const {
    data: heroData,
    isLoading: isLoadingHero,
    isError: isHeroError,
    refetch: refetchHero,
  } = useQuery({
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
  const {
    data: synergyData,
    isLoading: isLoadingSynergy,
    isError: isSynergyError,
    refetch: refetchSynergy,
  } = useQuery({
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
  const {
    data: counterData,
    isLoading: isLoadingCounter,
    isError: isCounterError,
    refetch: refetchCounter,
  } = useQuery({
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
    for (const synergy of (hasPreviousInterval ? prevSynergyData : undefined) || []) {
      const relWinrate = matchupWinRateChange(synergy.wins, synergy.matches_played, [
        prevHeroStatsMap[synergy.hero_id1],
        prevHeroStatsMap[synergy.hero_id2],
      ]);
      if (relWinrate === undefined) continue;
      if (!map[synergy.hero_id1]) map[synergy.hero_id1] = {};
      if (!map[synergy.hero_id2]) map[synergy.hero_id2] = {};
      map[synergy.hero_id1][synergy.hero_id2] = relWinrate;
      map[synergy.hero_id2][synergy.hero_id1] = relWinrate;
    }
    return map;
  }, [prevSynergyData, prevHeroStatsMap, hasPreviousInterval]);

  const prevCounterRelWinrateMap = useMemo(() => {
    const map: Record<number, Record<number, number>> = {};
    for (const counter of (hasPreviousInterval ? prevCounterData : undefined) || []) {
      const relWinrate = matchupWinRateChange(counter.wins, counter.matches_played, [
        prevHeroStatsMap[counter.hero_id],
      ]);
      if (relWinrate === undefined) continue;
      if (!map[counter.hero_id]) map[counter.hero_id] = {};
      map[counter.hero_id][counter.enemy_hero_id] = relWinrate;
    }
    return map;
  }, [prevCounterData, prevHeroStatsMap, hasPreviousInterval]);

  const synergyRows = useMemo(() => {
    const rows: MatchupRow[] = [];
    for (const synergy of synergyData || []) {
      if (synergy.hero_id1 !== heroId && synergy.hero_id2 !== heroId) continue;
      const otherHeroId = synergy.hero_id1 === heroId ? synergy.hero_id2 : synergy.hero_id1;
      const relWinrate = matchupWinRateChange(synergy.wins, synergy.matches_played, [
        heroStatsMap[heroId],
        heroStatsMap[otherHeroId],
      ]);
      if (relWinrate === undefined) continue;
      rows.push({
        heroId: otherHeroId,
        matches: synergy.matches_played,
        wins: synergy.wins,
        relWinrate,
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
      const relWinrate = matchupWinRateChange(counter.wins, counter.matches_played, [heroStatsMap[heroId]]);
      if (relWinrate === undefined) continue;
      rows.push({
        heroId: counter.enemy_hero_id,
        matches: counter.matches_played,
        wins: counter.wins,
        relWinrate,
        prevRelWinrate: prevCounterRelWinrateMap[heroId]?.[counter.enemy_hero_id],
      });
    }
    rows.sort((a, b) => b.relWinrate - a.relWinrate);
    return rows;
  }, [heroId, counterData, heroStatsMap, prevCounterRelWinrateMap]);

  return {
    synergyRows,
    counterRows,
    isLoading,
    heroStats: heroStatsMap[heroId],
    isError: isHeroError || isSynergyError || isCounterError,
    retry: () => Promise.all([refetchHero(), refetchSynergy(), refetchCounter()]),
  };
}

export function HeroMatchupDetailsStatsTable({
  stat,
  onHeroSelected,
  linkHeroes,
  ...params
}: HeroMatchupParams & {
  stat: HeroMatchupDetailsStatsTableStat;
  onHeroSelected?: (heroId: number) => void;
  linkHeroes?: boolean;
}) {
  const { synergyRows, counterRows, isLoading } = useHeroMatchupRows(params);
  const isSynergy = stat === HeroMatchupDetailsStatsTableStat.SYNERGY;
  const rows = isSynergy ? synergyRows : counterRows;
  const relWinrates = rows.map((row) => row.relWinrate);
  const minRelWinrate = rows.length ? Math.min(...relWinrates) : 0;
  const maxRelWinrate = rows.length ? Math.max(...relWinrates) : 0;

  if (isLoading) {
    return <LoadingState label="hero matchups" align="center" />;
  }

  return (
    <Table>
      <TableHeader tone="muted">
        <TableRow>
          <TableHead className="text-center">#</TableHead>
          <TableHead data-pinned>Hero</TableHead>
          <TableHead className="whitespace-normal">
            {isSynergy ? "Combination (Win Rate Change)" : "Against (Win Rate Change)"}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, index) => (
          <TableRow
            key={row.heroId}
            data-interactive={onHeroSelected ? true : undefined}
            onClick={() => onHeroSelected?.(row.heroId)}
          >
            <TableCell>{index + 1}</TableCell>
            <TableCell data-pinned>
              {onHeroSelected ? (
                <Inline wrap="nowrap">
                  <HeroImage heroId={row.heroId} />
                  <Button
                    variant="link"
                    size="inline"
                    className="font-normal text-foreground"
                    onClick={(e) => {
                      e.stopPropagation();
                      onHeroSelected(row.heroId);
                    }}
                  >
                    <HeroName heroId={row.heroId} />
                  </Button>
                </Inline>
              ) : (
                <HeroCell heroId={row.heroId} linkToDetail={linkHeroes} />
              )}
            </TableCell>
            <TableCell>
              <ProgressBarWithLabel
                min={minRelWinrate}
                max={maxRelWinrate}
                value={row.relWinrate}
                color={isSynergy ? "var(--primary)" : "var(--chart-4)"}
                label={formatSignedPercent(row.relWinrate)}
                delta={row.prevRelWinrate !== undefined ? row.relWinrate - row.prevRelWinrate : undefined}
                tooltip={
                  <>
                    <TooltipStats variant="plain">
                      <TooltipStat label="Matches" value={row.matches.toLocaleString("en-US")} />
                      <TooltipStat label="Wins" value={row.wins.toLocaleString("en-US")} />
                      <TooltipStat label="Win rate change" value={<Delta value={row.relWinrate} digits={2} />} />
                    </TooltipStats>
                    {row.prevRelWinrate !== undefined && (
                      <TooltipStats>
                        <TooltipStat label="Previous" value={<Delta value={row.prevRelWinrate} digits={2} />} />
                      </TooltipStats>
                    )}
                  </>
                }
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
