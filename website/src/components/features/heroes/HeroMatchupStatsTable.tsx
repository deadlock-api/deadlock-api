import { useQuery } from "@tanstack/react-query";
import type { AnalyticsHeroStats, HeroCounterStats, HeroSynergyStats } from "deadlock_api_client";
import { useMemo } from "react";

import { HeroCell } from "~/components/domain/assets/HeroCell";
import { HeroImage } from "~/components/domain/assets/HeroImage";
import { HeroName } from "~/components/domain/assets/HeroName";
import { TableEmptyRow } from "~/components/patterns/data-table/TableEmptyRow";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { Delta } from "~/components/ui/delta";
import { ProgressBarWithLabel } from "~/components/ui/progress-bar";
import { Inline } from "~/components/ui/stack";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { Tooltip, TooltipHeader, TooltipStat, TooltipStats, TooltipTarget } from "~/components/ui/tooltip";
import { CACHE_DURATIONS } from "~/constants/cache";
import type { Dayjs } from "~/dayjs";
import { useNormalizedTimeRange } from "~/hooks/useNormalizedTimeRange";
import { api } from "~/lib/api";
import { formatSignedPercent } from "~/lib/format";
import type { GameMode, MatchMode } from "~/lib/game-mode";
import { queryKeys } from "~/queries/query-keys";
import type { Color } from "~/types/general";

type SynergyEntry = Pick<HeroSynergyStats, "hero_id1" | "hero_id2" | "wins" | "matches_played"> & {
  rel_winrate: number;
};

type CounterEntry = HeroCounterStats & { rel_winrate: number };

function buildHeroStatsMap(data: AnalyticsHeroStats[] | undefined): Record<number, AnalyticsHeroStats> {
  const map: Record<number, AnalyticsHeroStats> = {};
  for (const hero of data || []) {
    if (!hero?.matches || !hero?.wins) continue;
    map[hero.hero_id] = hero;
  }
  return map;
}

function buildSynergyMap(
  synergyData: HeroSynergyStats[] | undefined,
  heroStatsMap: Record<number, AnalyticsHeroStats>,
): Record<number, SynergyEntry[]> {
  const synergyMap: Record<number, SynergyEntry[]> = {};
  for (const synergy of synergyData || []) {
    if (!synergy?.matches_played || synergy.wins == null) continue;
    if (!heroStatsMap[synergy.hero_id2]?.matches || !heroStatsMap[synergy.hero_id1]?.matches) continue;
    if (!synergyMap[synergy.hero_id1]) synergyMap[synergy.hero_id1] = [];
    if (!synergyMap[synergy.hero_id2]) synergyMap[synergy.hero_id2] = [];
    const rel_winrate =
      synergy.wins / synergy.matches_played -
      (heroStatsMap[synergy.hero_id1].wins / heroStatsMap[synergy.hero_id1].matches +
        heroStatsMap[synergy.hero_id2].wins / heroStatsMap[synergy.hero_id2].matches) /
        2;
    synergyMap[synergy.hero_id1].push({ ...synergy, rel_winrate });
    synergyMap[synergy.hero_id2].push({
      hero_id1: synergy.hero_id2,
      hero_id2: synergy.hero_id1,
      wins: synergy.wins,
      matches_played: synergy.matches_played,
      rel_winrate,
    });
  }
  return synergyMap;
}

function pickTopFromMap<T extends { rel_winrate: number }>(
  map: Record<number, T[]>,
  direction: "best" | "worst",
): Record<number, T> {
  const result: Record<number, T> = {};
  for (const heroId of Object.keys(map)) {
    const heroIdParsed = Number.parseInt(heroId, 10);
    const sorted = map[heroIdParsed].sort((a, b) =>
      direction === "best" ? b.rel_winrate - a.rel_winrate : a.rel_winrate - b.rel_winrate,
    );
    if (sorted[0]) result[heroIdParsed] = sorted[0];
  }
  return result;
}

function buildCounterMap(
  counterData: HeroCounterStats[] | undefined,
  heroStatsMap: Record<number, AnalyticsHeroStats>,
): Record<number, CounterEntry[]> {
  const counterMap: Record<number, CounterEntry[]> = {};
  for (const counter of counterData || []) {
    if (!counter?.matches_played || counter.wins == null) continue;
    if (!heroStatsMap[counter.hero_id]?.matches || !heroStatsMap[counter.hero_id]?.wins) continue;
    if (!counterMap[counter.hero_id]) counterMap[counter.hero_id] = [];
    counterMap[counter.hero_id].push({
      ...counter,
      rel_winrate:
        counter.wins / counter.matches_played -
        heroStatsMap[counter.hero_id].wins / heroStatsMap[counter.hero_id].matches,
    });
  }
  return counterMap;
}

function getMinMax(entries: Record<number, { rel_winrate: number }>): { min: number; max: number } {
  const values = Object.values(entries).map((e) => e.rel_winrate);
  if (values.length === 0) return { min: 0, max: 0 };
  return { min: Math.min(...values), max: Math.max(...values) };
}

function MatchupTooltip({
  heroId,
  partnerId,
  separator,
  matchesPlayed,
  wins,
  relWinrate,
  prevRelWinrate,
}: {
  heroId: number;
  partnerId: number;
  separator: string;
  matchesPlayed: number;
  wins: number;
  relWinrate: number;
  prevRelWinrate: number | undefined;
}) {
  return (
    <>
      <TooltipHeader
        title={
          <Inline gap={1.5}>
            <HeroName heroId={heroId} />
            <span className="text-muted-foreground">{separator}</span>
            <HeroName heroId={partnerId} />
          </Inline>
        }
      />
      <TooltipStats>
        <TooltipStat label="Matches" value={matchesPlayed.toLocaleString("en-US")} />
        <TooltipStat label="Wins" value={wins.toLocaleString("en-US")} />
        <TooltipStat label="Win rate" value={`${((wins / matchesPlayed) * 100).toFixed(2)}%`} />
        <TooltipStat label="Win rate change" value={<Delta value={relWinrate} digits={2} />} />
      </TooltipStats>
      {prevRelWinrate !== undefined && (
        <TooltipStats>
          <TooltipStat label="Previous" value={<Delta value={prevRelWinrate} digits={2} />} />
        </TooltipStats>
      )}
    </>
  );
}

function MatchupCell({
  heroId,
  partnerId,
  relWinrate,
  prevRelWinrate,
  min,
  max,
  color,
  separator,
  matchesPlayed,
  wins,
}: {
  heroId: number;
  partnerId?: number;
  relWinrate?: number;
  prevRelWinrate: number | undefined;
  min: number;
  max: number;
  color: Color;
  separator: string;
  matchesPlayed?: number;
  wins?: number;
}) {
  if (partnerId == null || relWinrate == null || matchesPlayed == null || wins == null) {
    return <TableCell />;
  }

  return (
    <TableCell>
      <Inline wrap="nowrap">
        <HeroImage heroId={partnerId} />
        <Tooltip
          content={
            <MatchupTooltip
              heroId={heroId}
              partnerId={partnerId}
              separator={separator}
              matchesPlayed={matchesPlayed}
              wins={wins}
              relWinrate={relWinrate}
              prevRelWinrate={prevRelWinrate}
            />
          }
        >
          <TooltipTarget display="block" className="w-full">
            <ProgressBarWithLabel
              min={min}
              max={max}
              value={relWinrate}
              color={color}
              label={formatSignedPercent(relWinrate)}
              delta={prevRelWinrate !== undefined ? relWinrate - prevRelWinrate : undefined}
            />
          </TooltipTarget>
        </Tooltip>
      </Inline>
    </TableCell>
  );
}

export function HeroMatchupStatsTable({
  hideHeader,
  minRankId,
  maxRankId,
  minMatches,
  minDate,
  maxDate,
  prevMinDate,
  prevMaxDate,
  sameLaneFilter,
  gameMode,
  matchMode,
}: {
  hideHeader?: boolean;
  minRankId?: number;
  maxRankId?: number;
  minMatches?: number;
  minDate?: Dayjs;
  maxDate?: Dayjs;
  prevMinDate?: Dayjs;
  prevMaxDate?: Dayjs;
  sameLaneFilter?: boolean;
  gameMode?: GameMode;
  matchMode?: MatchMode;
}) {
  const { minUnixTimestamp, maxUnixTimestamp } = useNormalizedTimeRange(minDate, maxDate);
  const { minUnixTimestamp: prevMinTimestamp, maxUnixTimestamp: prevMaxTimestamp } = useNormalizedTimeRange(
    prevMinDate,
    prevMaxDate,
  );

  const heroStatsQuery = {
    minHeroMatches: minMatches,
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
    minMatches: minMatches,
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
    minMatches: minMatches,
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
    minHeroMatches: minMatches,
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
    minMatches: minMatches,
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
    minMatches: minMatches,
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

  const isLoading = isLoadingSynergy || isLoadingCounter || isLoadingHero;

  const heroStatsMap = useMemo(() => buildHeroStatsMap(heroData), [heroData]);
  const prevHeroStatsMap = useMemo(() => buildHeroStatsMap(prevHeroData), [prevHeroData]);

  const prevSynergyRelWinrateMap = useMemo(() => {
    const map: Record<number, Record<number, number>> = {};
    for (const synergy of prevSynergyData || []) {
      if (!synergy?.matches_played || synergy.wins == null) continue;
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
      if (!counter?.matches_played || counter.wins == null) continue;
      if (!prevHeroStatsMap[counter.hero_id]?.matches) continue;
      const relWinrate =
        counter.wins / counter.matches_played -
        prevHeroStatsMap[counter.hero_id].wins / prevHeroStatsMap[counter.hero_id].matches;
      if (!map[counter.hero_id]) map[counter.hero_id] = {};
      map[counter.hero_id][counter.enemy_hero_id] = relWinrate;
    }
    return map;
  }, [prevCounterData, prevHeroStatsMap]);

  const synergyMap = useMemo(() => buildSynergyMap(synergyData, heroStatsMap), [synergyData, heroStatsMap]);
  const counterMap = useMemo(() => buildCounterMap(counterData, heroStatsMap), [counterData, heroStatsMap]);

  const heroBestSynergies = useMemo(() => pickTopFromMap(synergyMap, "best"), [synergyMap]);
  const heroWorstSynergies = useMemo(() => pickTopFromMap(synergyMap, "worst"), [synergyMap]);
  const heroBestAgainst = useMemo(() => pickTopFromMap(counterMap, "best"), [counterMap]);
  const heroWorstAgainst = useMemo(() => pickTopFromMap(counterMap, "worst"), [counterMap]);

  const bestSynergyRange = useMemo(() => getMinMax(heroBestSynergies), [heroBestSynergies]);
  const worstSynergyRange = useMemo(() => getMinMax(heroWorstSynergies), [heroWorstSynergies]);
  const bestAgainstRange = useMemo(() => getMinMax(heroBestAgainst), [heroBestAgainst]);
  const worstAgainstRange = useMemo(() => getMinMax(heroWorstAgainst), [heroWorstAgainst]);

  const heroIds = useMemo(() => {
    const allHeroIds = new Set<number>();
    for (const heroId of Object.keys(heroBestSynergies)) {
      allHeroIds.add(Number.parseInt(heroId, 10));
    }
    for (const heroId of Object.keys(heroBestAgainst)) {
      allHeroIds.add(Number.parseInt(heroId, 10));
    }
    return Array.from(allHeroIds);
  }, [heroBestSynergies, heroBestAgainst]);

  if (isLoading) {
    return <LoadingState label="hero matchups" align="center" />;
  }

  if ((isHeroError || isSynergyError || isCounterError) && heroIds.length === 0) {
    return (
      <ErrorState
        title="Hero matchups did not load"
        onRetry={() => void Promise.all([refetchHero(), refetchSynergy(), refetchCounter()])}
      />
    );
  }

  return (
    <Table>
      {!hideHeader && (
        <TableHeader tone="muted">
          <TableRow>
            <TableHead>#</TableHead>
            <TableHead data-pinned>Hero</TableHead>
            <TableHead title="Win Rate Increase/Decrease">Best Combination</TableHead>
            <TableHead title="Win Rate Increase/Decrease">Worst Combination</TableHead>
            <TableHead title="Win Rate Increase/Decrease">Best Against</TableHead>
            <TableHead title="Win Rate Increase/Decrease">Worst Against</TableHead>
          </TableRow>
        </TableHeader>
      )}
      <TableBody>
        {heroIds.length === 0 && (
          <TableEmptyRow colSpan={6}>No matchups with enough matches for these filters</TableEmptyRow>
        )}
        {heroIds.map((heroId, index) => (
          <TableRow key={heroId}>
            <TableCell className="font-semibold">{index + 1}</TableCell>
            <TableCell data-pinned>
              <HeroCell heroId={heroId} />
            </TableCell>
            <MatchupCell
              heroId={heroId}
              partnerId={heroBestSynergies[heroId]?.hero_id2}
              relWinrate={heroBestSynergies[heroId]?.rel_winrate}
              prevRelWinrate={prevSynergyRelWinrateMap[heroId]?.[heroBestSynergies[heroId]?.hero_id2]}
              min={bestSynergyRange.min}
              max={bestSynergyRange.max}
              color="var(--primary)"
              separator="+"
              matchesPlayed={heroBestSynergies[heroId]?.matches_played}
              wins={heroBestSynergies[heroId]?.wins}
            />
            <MatchupCell
              heroId={heroId}
              partnerId={heroWorstSynergies[heroId]?.hero_id2}
              relWinrate={heroWorstSynergies[heroId]?.rel_winrate}
              prevRelWinrate={prevSynergyRelWinrateMap[heroId]?.[heroWorstSynergies[heroId]?.hero_id2]}
              min={worstSynergyRange.min}
              max={worstSynergyRange.max}
              color="var(--primary)"
              separator="+"
              matchesPlayed={heroWorstSynergies[heroId]?.matches_played}
              wins={heroWorstSynergies[heroId]?.wins}
            />
            <MatchupCell
              heroId={heroId}
              partnerId={heroBestAgainst[heroId]?.enemy_hero_id}
              relWinrate={heroBestAgainst[heroId]?.rel_winrate}
              prevRelWinrate={prevCounterRelWinrateMap[heroId]?.[heroBestAgainst[heroId]?.enemy_hero_id]}
              min={bestAgainstRange.min}
              max={bestAgainstRange.max}
              color="var(--chart-4)"
              separator="vs"
              matchesPlayed={heroBestAgainst[heroId]?.matches_played}
              wins={heroBestAgainst[heroId]?.wins}
            />
            <MatchupCell
              heroId={heroId}
              partnerId={heroWorstAgainst[heroId]?.enemy_hero_id}
              relWinrate={heroWorstAgainst[heroId]?.rel_winrate}
              prevRelWinrate={prevCounterRelWinrateMap[heroId]?.[heroWorstAgainst[heroId]?.enemy_hero_id]}
              min={worstAgainstRange.min}
              max={worstAgainstRange.max}
              color="var(--chart-4)"
              separator="vs"
              matchesPlayed={heroWorstAgainst[heroId]?.matches_played}
              wins={heroWorstAgainst[heroId]?.wins}
            />
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
