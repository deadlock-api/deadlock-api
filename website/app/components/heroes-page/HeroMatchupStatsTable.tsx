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
import { api } from "~/lib/api";
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
    if (!synergy?.matches_played || !synergy?.wins) continue;
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
    if (!counter?.matches_played || !counter?.wins) continue;
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
    <div className="flex flex-col gap-1 text-xs">
      <div className="mb-0.5 flex items-center gap-1.5 border-b border-border pb-1 font-medium">
        <HeroName heroId={heroId} />
        <span className="text-muted-foreground">{separator}</span>
        <HeroName heroId={partnerId} />
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-muted-foreground">Matches</span>
        <span className="font-medium">{matchesPlayed.toLocaleString()}</span>
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-muted-foreground">Wins</span>
        <span className="font-medium">{wins.toLocaleString()}</span>
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-muted-foreground">Win rate</span>
        <span className="font-medium">{((wins / matchesPlayed) * 100).toFixed(2)}%</span>
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-muted-foreground">Win rate change</span>
        <span className="font-medium">
          {relWinrate > 0 ? "+" : ""}
          {(relWinrate * 100).toFixed(2)}%
        </span>
      </div>
      {prevRelWinrate !== undefined && (
        <div className="mt-0.5 flex justify-between gap-4 border-t border-border pt-1">
          <span className="text-muted-foreground">Previous</span>
          <span className="font-medium">
            {prevRelWinrate > 0 ? "+" : ""}
            {(prevRelWinrate * 100).toFixed(2)}%
          </span>
        </div>
      )}
    </div>
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
      <div className="flex items-center gap-2">
        <HeroImage heroId={partnerId} />
        <ProgressBarWithLabel
          min={min}
          max={max}
          value={relWinrate}
          color={color}
          label={`${relWinrate > 0 ? "+" : ""}${Math.round(relWinrate * 100).toFixed(0)}% `}
          delta={prevRelWinrate !== undefined ? relWinrate - prevRelWinrate : undefined}
          tooltip={
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
        />
      </div>
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
}) {
  const minDateTimestamp = useMemo(() => minDate?.unix() ?? 0, [minDate]);
  const maxDateTimestamp = useMemo(() => maxDate?.unix(), [maxDate]);

  const heroStatsQuery = {
    minHeroMatches: minMatches,
    minAverageBadge: minRankId,
    maxAverageBadge: maxRankId,
    minUnixTimestamp: minDateTimestamp,
    maxUnixTimestamp: maxDateTimestamp,
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
    minMatches: minMatches,
    minAverageBadge: minRankId,
    maxAverageBadge: maxRankId,
    minUnixTimestamp: minDateTimestamp,
    maxUnixTimestamp: maxDateTimestamp,
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
    minMatches: minMatches,
    minAverageBadge: minRankId,
    maxAverageBadge: maxRankId,
    minUnixTimestamp: minDateTimestamp,
    maxUnixTimestamp: maxDateTimestamp,
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

  const prevMinTimestamp = useMemo(() => prevMinDate?.unix() ?? 0, [prevMinDate]);
  const prevMaxTimestamp = useMemo(() => prevMaxDate?.unix(), [prevMaxDate]);
  const hasPreviousInterval = prevMinDate != null && prevMaxDate != null;

  const prevHeroStatsQuery = {
    minHeroMatches: minMatches,
    minAverageBadge: minRankId,
    maxAverageBadge: maxRankId,
    minUnixTimestamp: prevMinTimestamp,
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
    minMatches: minMatches,
    minAverageBadge: minRankId,
    maxAverageBadge: maxRankId,
    minUnixTimestamp: prevMinTimestamp,
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
    minMatches: minMatches,
    minAverageBadge: minRankId,
    maxAverageBadge: maxRankId,
    minUnixTimestamp: prevMinTimestamp,
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

  const isLoading = isLoadingSynergy || isLoadingCounter || isLoadingHero;

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
    return (
      <div className="flex h-full w-full items-center justify-center py-16">
        <LoadingLogo />
      </div>
    );
  }

  return (
    <Table>
      {!hideHeader && (
        <TableHeader className="bg-muted">
          <TableRow>
            <TableHead>#</TableHead>
            <TableHead>Hero</TableHead>
            <TableHead title="Win Rate Increase/Decrease">Best Combination</TableHead>
            <TableHead title="Win Rate Increase/Decrease">Worst Combination</TableHead>
            <TableHead title="Win Rate Increase/Decrease">Best Against</TableHead>
            <TableHead title="Win Rate Increase/Decrease">Worst Against</TableHead>
          </TableRow>
        </TableHeader>
      )}
      <TableBody>
        {heroIds?.map((heroId, index) => (
          <TableRow key={heroId}>
            <TableCell className="font-semibold">{index + 1}</TableCell>
            <TableCell>
              <div className="flex items-center gap-2">
                <HeroImage heroId={heroId} />
                <HeroName heroId={heroId} />
              </div>
            </TableCell>
            <MatchupCell
              heroId={heroId}
              partnerId={heroBestSynergies[heroId]?.hero_id2}
              relWinrate={heroBestSynergies[heroId]?.rel_winrate}
              prevRelWinrate={prevSynergyRelWinrateMap[heroId]?.[heroBestSynergies[heroId]?.hero_id2]}
              min={bestSynergyRange.min}
              max={bestSynergyRange.max}
              color="#fa4454"
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
              color="#fa4454"
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
              color="#22d3ee"
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
              color="#22d3ee"
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
