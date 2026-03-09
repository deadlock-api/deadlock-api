import { useQuery } from "@tanstack/react-query";
import type { AnalyticsHeroStats, HeroCounterStats, HeroSynergyStats } from "deadlock_api_client";
import { useMemo } from "react";
import HeroImage from "~/components/HeroImage";
import HeroName from "~/components/HeroName";
import { LoadingLogo } from "~/components/LoadingLogo";
import { ProgressBarWithLabel } from "~/components/primitives/ProgressBar";
import type { GameMode } from "~/components/selectors/GameModeSelector";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import type { Dayjs } from "~/dayjs";
import { api } from "~/lib/api";
import { queryKeys } from "~/queries/query-keys";

export default function HeroMatchupStatsTable({
  hideHeader,
  minRankId,
  maxRankId,
  minMatches,
  minDate,
  maxDate,
  prevMinDate,
  prevMaxDate,
  sameLaneFilter,
  samePartyFilter,
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
  samePartyFilter?: boolean;
  gameMode?: GameMode;
}) {
  const minDateTimestamp = useMemo(() => minDate?.unix() ?? 0, [minDate]);
  const maxDateTimestamp = useMemo(() => maxDate?.unix(), [maxDate]);

  const { data: heroData, isLoading: isLoadingHero } = useQuery({
    queryKey: queryKeys.analytics.heroStats(
      minRankId,
      maxRankId,
      minDateTimestamp,
      maxDateTimestamp,
      minMatches,
      undefined,
      gameMode,
    ),
    queryFn: async () => {
      const response = await api.analytics_api.heroStats({
        minHeroMatches: minMatches,
        minAverageBadge: minRankId,
        maxAverageBadge: maxRankId,
        minUnixTimestamp: minDateTimestamp,
        maxUnixTimestamp: maxDateTimestamp,
        gameMode: gameMode,
      });
      return response.data;
    },
    staleTime: 24 * 60 * 60 * 1000, // 24 hours
  });

  const { data: synergyData, isLoading: isLoadingSynergy } = useQuery({
    queryKey: queryKeys.analytics.heroSynergyStats(
      minRankId,
      maxRankId,
      minDateTimestamp,
      maxDateTimestamp,
      sameLaneFilter,
      samePartyFilter,
      minMatches,
      gameMode,
    ),
    queryFn: async () => {
      const response = await api.analytics_api.heroSynergiesStats({
        sameLaneFilter: sameLaneFilter,
        samePartyFilter: samePartyFilter,
        minMatches: minMatches,
        minAverageBadge: minRankId,
        maxAverageBadge: maxRankId,
        minUnixTimestamp: minDateTimestamp,
        maxUnixTimestamp: maxDateTimestamp,
        gameMode: gameMode,
      });
      return response.data;
    },
    staleTime: 60 * 60 * 1000, // 1 hour
  });

  const { data: counterData, isLoading: isLoadingCounter } = useQuery({
    queryKey: queryKeys.analytics.heroCounterStats(
      minRankId,
      maxRankId,
      minDateTimestamp,
      maxDateTimestamp,
      sameLaneFilter,
      minMatches,
      gameMode,
    ),
    queryFn: async () => {
      const response = await api.analytics_api.heroCountersStats({
        sameLaneFilter: sameLaneFilter,
        minMatches: minMatches,
        minAverageBadge: minRankId,
        maxAverageBadge: maxRankId,
        minUnixTimestamp: minDateTimestamp,
        maxUnixTimestamp: maxDateTimestamp,
        gameMode: gameMode,
      });
      return response.data;
    },
    staleTime: 60 * 60 * 1000, // 1 hour
  });

  const prevMinTimestamp = useMemo(() => prevMinDate?.unix() ?? 0, [prevMinDate]);
  const prevMaxTimestamp = useMemo(() => prevMaxDate?.unix(), [prevMaxDate]);
  const hasPreviousInterval = prevMinDate != null && prevMaxDate != null;

  const { data: prevHeroData } = useQuery({
    queryKey: queryKeys.analytics.heroStats(
      minRankId,
      maxRankId,
      prevMinTimestamp,
      prevMaxTimestamp,
      minMatches,
      undefined,
      gameMode,
    ),
    queryFn: async () => {
      const response = await api.analytics_api.heroStats({
        minHeroMatches: minMatches,
        minAverageBadge: minRankId,
        maxAverageBadge: maxRankId,
        minUnixTimestamp: prevMinTimestamp,
        maxUnixTimestamp: prevMaxTimestamp,
        gameMode: gameMode,
      });
      return response.data;
    },
    staleTime: 24 * 60 * 60 * 1000,
    enabled: hasPreviousInterval,
  });

  const { data: prevSynergyData } = useQuery({
    queryKey: queryKeys.analytics.heroSynergyStats(
      minRankId,
      maxRankId,
      prevMinTimestamp,
      prevMaxTimestamp,
      sameLaneFilter,
      samePartyFilter,
      minMatches,
      gameMode,
    ),
    queryFn: async () => {
      const response = await api.analytics_api.heroSynergiesStats({
        sameLaneFilter: sameLaneFilter,
        samePartyFilter: samePartyFilter,
        minMatches: minMatches,
        minAverageBadge: minRankId,
        maxAverageBadge: maxRankId,
        minUnixTimestamp: prevMinTimestamp,
        maxUnixTimestamp: prevMaxTimestamp,
        gameMode: gameMode,
      });
      return response.data;
    },
    staleTime: 60 * 60 * 1000,
    enabled: hasPreviousInterval,
  });

  const { data: prevCounterData } = useQuery({
    queryKey: queryKeys.analytics.heroCounterStats(
      minRankId,
      maxRankId,
      prevMinTimestamp,
      prevMaxTimestamp,
      sameLaneFilter,
      minMatches,
      gameMode,
    ),
    queryFn: async () => {
      const response = await api.analytics_api.heroCountersStats({
        sameLaneFilter: sameLaneFilter,
        minMatches: minMatches,
        minAverageBadge: minRankId,
        maxAverageBadge: maxRankId,
        minUnixTimestamp: prevMinTimestamp,
        maxUnixTimestamp: prevMaxTimestamp,
        gameMode: gameMode,
      });
      return response.data;
    },
    staleTime: 60 * 60 * 1000,
    enabled: hasPreviousInterval,
  });

  const isLoading = useMemo(
    () => isLoadingSynergy || isLoadingCounter || isLoadingHero,
    [isLoadingSynergy, isLoadingCounter, isLoadingHero],
  );

  const heroStatsMap = useMemo(() => {
    const map: Record<number, AnalyticsHeroStats> = {};
    for (const hero of heroData || []) {
      if (!hero?.matches || !hero?.wins) continue;
      map[hero.hero_id] = hero;
    }
    return map;
  }, [heroData]);

  const prevHeroStatsMap = useMemo(() => {
    const map: Record<number, AnalyticsHeroStats> = {};
    for (const hero of prevHeroData || []) {
      if (!hero?.matches || !hero?.wins) continue;
      map[hero.hero_id] = hero;
    }
    return map;
  }, [prevHeroData]);

  // Map of (heroId -> partnerId -> rel_winrate) for previous period synergies
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

  // Map of (heroId -> enemyHeroId -> rel_winrate) for previous period counters
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

  const heroBestSynergies = useMemo(() => {
    function bestCombination(
      synergyMap: Record<
        number,
        (Pick<HeroSynergyStats, "hero_id1" | "hero_id2" | "wins" | "matches_played"> & {
          rel_winrate: number;
        })[]
      >,
      heroId: number,
    ) {
      if (!synergyMap[heroId]) return null;
      return synergyMap[heroId].sort((a, b) => b.rel_winrate - a.rel_winrate)[0];
    }

    const synergyMap: Record<
      number,
      (Pick<HeroSynergyStats, "hero_id1" | "hero_id2" | "wins" | "matches_played"> & {
        rel_winrate: number;
      })[]
    > = {};
    for (const synergy of synergyData || []) {
      if (!synergy?.matches_played || !synergy?.wins) continue;
      if (!heroStatsMap[synergy.hero_id2]?.matches || !heroStatsMap[synergy.hero_id1]?.matches) continue;
      if (!synergyMap[synergy.hero_id1]) synergyMap[synergy.hero_id1] = [];
      if (!synergyMap[synergy.hero_id2]) synergyMap[synergy.hero_id2] = [];
      synergyMap[synergy.hero_id1].push({
        ...synergy,
        rel_winrate:
          synergy?.wins / synergy?.matches_played -
          (heroStatsMap[synergy.hero_id1]?.wins / heroStatsMap[synergy.hero_id1]?.matches +
            heroStatsMap[synergy.hero_id2]?.wins / heroStatsMap[synergy.hero_id2]?.matches) /
            2,
      });
      synergyMap[synergy.hero_id2].push({
        hero_id1: synergy.hero_id2,
        hero_id2: synergy.hero_id1,
        wins: synergy?.wins,
        matches_played: synergy.matches_played,
        rel_winrate:
          synergy?.wins / synergy?.matches_played -
          (heroStatsMap[synergy.hero_id1]?.wins / heroStatsMap[synergy.hero_id1]?.matches +
            heroStatsMap[synergy.hero_id2]?.wins / heroStatsMap[synergy.hero_id2]?.matches) /
            2,
      });
    }
    const bestSynergies: Record<
      number,
      Pick<HeroSynergyStats, "hero_id1" | "hero_id2" | "wins" | "matches_played"> & {
        rel_winrate: number;
      }
    > = {};
    for (const heroId of Object.keys(synergyMap)) {
      const heroIdParsed = Number.parseInt(heroId, 10);
      const best = bestCombination(synergyMap, heroIdParsed);
      if (best) {
        bestSynergies[heroIdParsed] = best;
      }
    }
    return bestSynergies;
  }, [synergyData, heroStatsMap]);

  const heroMinBestSynergyWinrate = useMemo(() => {
    if (Object.keys(heroBestSynergies).length === 0) return 0;
    return Math.min(...Object.values(heroBestSynergies).map((synergy) => synergy.rel_winrate));
  }, [heroBestSynergies]);

  const heroMaxBestSynergyWinrate = useMemo(() => {
    if (Object.keys(heroBestSynergies).length === 0) return 0;
    return Math.max(...Object.values(heroBestSynergies).map((synergy) => synergy.rel_winrate));
  }, [heroBestSynergies]);

  const heroWorstSynergies = useMemo(() => {
    function worstCombination(
      synergyMap: Record<
        number,
        (Pick<HeroSynergyStats, "hero_id1" | "hero_id2" | "wins" | "matches_played"> & {
          rel_winrate: number;
        })[]
      >,
      heroId: number,
    ) {
      if (!synergyMap[heroId]) return null;
      return synergyMap[heroId].sort((a, b) => a.rel_winrate - b.rel_winrate)[0];
    }

    const synergyMap: Record<
      number,
      (Pick<HeroSynergyStats, "hero_id1" | "hero_id2" | "wins" | "matches_played"> & {
        rel_winrate: number;
      })[]
    > = {};
    for (const synergy of synergyData || []) {
      if (!synergy?.matches_played || !synergy?.wins) continue;
      if (!heroStatsMap[synergy.hero_id2]?.matches || !heroStatsMap[synergy.hero_id1]?.matches) continue;
      if (!synergyMap[synergy.hero_id1]) synergyMap[synergy.hero_id1] = [];
      if (!synergyMap[synergy.hero_id2]) synergyMap[synergy.hero_id2] = [];
      synergyMap[synergy.hero_id1].push({
        ...synergy,
        rel_winrate:
          synergy?.wins / synergy.matches_played -
          (heroStatsMap[synergy.hero_id1]?.wins / heroStatsMap[synergy.hero_id1]?.matches +
            heroStatsMap[synergy.hero_id2]?.wins / heroStatsMap[synergy.hero_id2]?.matches) /
            2,
      });
      synergyMap[synergy.hero_id2].push({
        hero_id1: synergy.hero_id2,
        hero_id2: synergy.hero_id1,
        wins: synergy?.wins,
        matches_played: synergy.matches_played,
        rel_winrate:
          synergy?.wins / synergy.matches_played -
          (heroStatsMap[synergy.hero_id1]?.wins / heroStatsMap[synergy.hero_id1]?.matches +
            heroStatsMap[synergy.hero_id2]?.wins / heroStatsMap[synergy.hero_id2]?.matches) /
            2,
      });
    }
    const bestSynergies: Record<
      number,
      Pick<HeroSynergyStats, "hero_id1" | "hero_id2" | "wins" | "matches_played"> & {
        rel_winrate: number;
      }
    > = {};
    for (const heroId of Object.keys(synergyMap)) {
      const heroIdParsed = Number.parseInt(heroId, 10);
      const worst = worstCombination(synergyMap, heroIdParsed);
      if (worst) {
        bestSynergies[heroIdParsed] = worst;
      }
    }
    return bestSynergies;
  }, [synergyData, heroStatsMap]);

  const heroMinWorstSynergyWinrate = useMemo(() => {
    if (Object.keys(heroWorstSynergies).length === 0) return 0;
    return Math.min(...Object.values(heroWorstSynergies).map((synergy) => synergy.rel_winrate));
  }, [heroWorstSynergies]);

  const heroMaxWorstSynergyWinrate = useMemo(() => {
    if (Object.keys(heroWorstSynergies).length === 0) return 0;
    return Math.max(...Object.values(heroWorstSynergies).map((synergy) => synergy.rel_winrate));
  }, [heroWorstSynergies]);

  const heroBestAgainst = useMemo(() => {
    function bestAgainst(counterMap: Record<number, (HeroCounterStats & { rel_winrate: number })[]>, heroId: number) {
      if (!counterMap[heroId]) return null;
      return counterMap[heroId].sort((a, b) => b.rel_winrate - a.rel_winrate)[0];
    }

    const counterMap: Record<number, (HeroCounterStats & { rel_winrate: number })[]> = {};
    for (const counter of counterData || []) {
      if (!counter?.matches_played || !counter?.wins) continue;
      if (!heroStatsMap[counter.hero_id]?.matches || !heroStatsMap[counter.hero_id]?.wins) continue;
      if (!counterMap[counter.hero_id]) counterMap[counter.hero_id] = [];
      counterMap[counter.hero_id].push({
        ...counter,
        rel_winrate:
          counter?.wins / counter?.matches_played -
          heroStatsMap[counter.hero_id]?.wins / heroStatsMap[counter.hero_id]?.matches,
      });
    }
    const bestCounters: Record<number, HeroCounterStats & { rel_winrate: number }> = {};
    for (const heroId of Object.keys(counterMap)) {
      const heroIdParsed = Number.parseInt(heroId, 10);
      const best = bestAgainst(counterMap, heroIdParsed);
      if (best) {
        bestCounters[heroIdParsed] = best;
      }
    }
    return bestCounters;
  }, [counterData, heroStatsMap]);

  const heroMinBestAgainstWinrate = useMemo(() => {
    if (Object.keys(heroBestAgainst).length === 0) return 0;
    return Math.min(...Object.values(heroBestAgainst).map((counter) => counter.rel_winrate));
  }, [heroBestAgainst]);

  const heroMaxBestAgainstWinrate = useMemo(() => {
    if (Object.keys(heroBestAgainst).length === 0) return 0;
    return Math.max(...Object.values(heroBestAgainst).map((counter) => counter.rel_winrate));
  }, [heroBestAgainst]);

  const heroWorstAgainst = useMemo(() => {
    function worstAgainst(counterMap: Record<number, (HeroCounterStats & { rel_winrate: number })[]>, heroId: number) {
      if (!counterMap[heroId]) return null;
      return counterMap[heroId].sort((a, b) => a.rel_winrate - b.rel_winrate)[0];
    }

    const counterMap: Record<number, (HeroCounterStats & { rel_winrate: number })[]> = {};
    for (const counter of counterData || []) {
      if (!counter?.matches_played || !counter?.wins) continue;
      if (!heroStatsMap[counter.hero_id]?.matches) continue;
      if (!counterMap[counter.hero_id]) counterMap[counter.hero_id] = [];
      counterMap[counter.hero_id].push({
        ...counter,
        rel_winrate:
          counter?.wins / counter?.matches_played -
          heroStatsMap[counter.hero_id]?.wins / heroStatsMap[counter.hero_id]?.matches,
      });
    }
    const worstCounters: Record<number, HeroCounterStats & { rel_winrate: number }> = {};
    for (const heroId of Object.keys(counterMap)) {
      const heroIdParsed = Number.parseInt(heroId, 10);
      const worst = worstAgainst(counterMap, heroIdParsed);
      if (worst) {
        worstCounters[heroIdParsed] = worst;
      }
    }
    return worstCounters;
  }, [counterData, heroStatsMap]);

  const heroMinWorstAgainstWinrate = useMemo(() => {
    if (Object.keys(heroWorstAgainst).length === 0) return 0;
    return Math.min(...Object.values(heroWorstAgainst).map((counter) => counter.rel_winrate));
  }, [heroWorstAgainst]);

  const heroMaxWorstAgainstWinrate = useMemo(() => {
    if (Object.keys(heroWorstAgainst).length === 0) return 0;
    return Math.max(...Object.values(heroWorstAgainst).map((counter) => counter.rel_winrate));
  }, [heroWorstAgainst]);

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
      <div className="flex items-center justify-center w-full h-full py-16">
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
            <TableCell>
              <div className="flex flex-col gap-2">
                <div key={heroBestSynergies[heroId]?.hero_id2} className="flex items-center gap-2">
                  <HeroImage heroId={heroBestSynergies[heroId]?.hero_id2} />
                  <ProgressBarWithLabel
                    min={heroMinBestSynergyWinrate}
                    max={heroMaxBestSynergyWinrate}
                    value={heroBestSynergies[heroId]?.rel_winrate}
                    color={"#fa4454"}
                    label={`${heroBestSynergies[heroId]?.rel_winrate > 0 ? "+" : ""}${(Math.round(heroBestSynergies[heroId]?.rel_winrate * 100)).toFixed(0)}% `}
                    delta={
                      prevSynergyRelWinrateMap[heroId]?.[heroBestSynergies[heroId]?.hero_id2] !== undefined
                        ? heroBestSynergies[heroId]?.rel_winrate -
                          prevSynergyRelWinrateMap[heroId][heroBestSynergies[heroId]?.hero_id2]
                        : undefined
                    }
                    tooltip={
                      <div className="flex flex-col gap-1 text-xs">
                        <div className="flex items-center gap-1.5 font-medium pb-1 mb-0.5 border-b border-border">
                          <HeroName heroId={heroId} />
                          <span className="text-muted-foreground">+</span>
                          <HeroName heroId={heroBestSynergies[heroId]?.hero_id2} />
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-muted-foreground">Matches</span>
                          <span className="font-medium">
                            {heroBestSynergies[heroId]?.matches_played.toLocaleString()}
                          </span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-muted-foreground">Wins</span>
                          <span className="font-medium">{heroBestSynergies[heroId]?.wins.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-muted-foreground">Win rate</span>
                          <span className="font-medium">
                            {(
                              (heroBestSynergies[heroId]?.wins / heroBestSynergies[heroId]?.matches_played) *
                              100
                            ).toFixed(2)}
                            %
                          </span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-muted-foreground">Win rate change</span>
                          <span className="font-medium">
                            {heroBestSynergies[heroId]?.rel_winrate > 0 ? "+" : ""}
                            {(heroBestSynergies[heroId]?.rel_winrate * 100).toFixed(2)}%
                          </span>
                        </div>
                        {prevSynergyRelWinrateMap[heroId]?.[heroBestSynergies[heroId]?.hero_id2] !== undefined && (
                          <div className="flex justify-between gap-4 border-t border-border pt-1 mt-0.5">
                            <span className="text-muted-foreground">Previous</span>
                            <span className="font-medium">
                              {prevSynergyRelWinrateMap[heroId][heroBestSynergies[heroId]?.hero_id2] > 0 ? "+" : ""}
                              {(prevSynergyRelWinrateMap[heroId][heroBestSynergies[heroId]?.hero_id2] * 100).toFixed(2)}
                              %
                            </span>
                          </div>
                        )}
                      </div>
                    }
                  />
                </div>
              </div>
            </TableCell>
            <TableCell>
              <div className="flex flex-col gap-2">
                <div key={heroWorstSynergies[heroId]?.hero_id2} className="flex items-center gap-2">
                  <HeroImage heroId={heroWorstSynergies[heroId]?.hero_id2} />
                  <ProgressBarWithLabel
                    min={heroMinWorstSynergyWinrate}
                    max={heroMaxWorstSynergyWinrate}
                    value={heroWorstSynergies[heroId]?.rel_winrate}
                    color={"#fa4454"}
                    label={`${heroWorstSynergies[heroId]?.rel_winrate > 0 ? "+" : ""}${(Math.round(heroWorstSynergies[heroId]?.rel_winrate * 100)).toFixed(0)}% `}
                    delta={
                      prevSynergyRelWinrateMap[heroId]?.[heroWorstSynergies[heroId]?.hero_id2] !== undefined
                        ? heroWorstSynergies[heroId]?.rel_winrate -
                          prevSynergyRelWinrateMap[heroId][heroWorstSynergies[heroId]?.hero_id2]
                        : undefined
                    }
                    tooltip={
                      <div className="flex flex-col gap-1 text-xs">
                        <div className="flex items-center gap-1.5 font-medium pb-1 mb-0.5 border-b border-border">
                          <HeroName heroId={heroId} />
                          <span className="text-muted-foreground">+</span>
                          <HeroName heroId={heroWorstSynergies[heroId]?.hero_id2} />
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-muted-foreground">Matches</span>
                          <span className="font-medium">
                            {heroWorstSynergies[heroId]?.matches_played.toLocaleString()}
                          </span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-muted-foreground">Wins</span>
                          <span className="font-medium">{heroWorstSynergies[heroId]?.wins.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-muted-foreground">Win rate</span>
                          <span className="font-medium">
                            {(
                              (heroWorstSynergies[heroId]?.wins / heroWorstSynergies[heroId]?.matches_played) *
                              100
                            ).toFixed(2)}
                            %
                          </span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-muted-foreground">Win rate change</span>
                          <span className="font-medium">
                            {heroWorstSynergies[heroId]?.rel_winrate > 0 ? "+" : ""}
                            {(heroWorstSynergies[heroId]?.rel_winrate * 100).toFixed(2)}%
                          </span>
                        </div>
                        {prevSynergyRelWinrateMap[heroId]?.[heroWorstSynergies[heroId]?.hero_id2] !== undefined && (
                          <div className="flex justify-between gap-4 border-t border-border pt-1 mt-0.5">
                            <span className="text-muted-foreground">Previous</span>
                            <span className="font-medium">
                              {prevSynergyRelWinrateMap[heroId][heroWorstSynergies[heroId]?.hero_id2] > 0 ? "+" : ""}
                              {(prevSynergyRelWinrateMap[heroId][heroWorstSynergies[heroId]?.hero_id2] * 100).toFixed(
                                2,
                              )}
                              %
                            </span>
                          </div>
                        )}
                      </div>
                    }
                  />
                </div>
              </div>
            </TableCell>
            <TableCell>
              <div className="flex flex-col gap-2">
                <div key={heroBestAgainst[heroId]?.enemy_hero_id} className="flex items-center gap-2">
                  <HeroImage heroId={heroBestAgainst[heroId]?.enemy_hero_id} />
                  <ProgressBarWithLabel
                    min={heroMinBestAgainstWinrate}
                    max={heroMaxBestAgainstWinrate}
                    value={heroBestAgainst[heroId]?.rel_winrate}
                    color={"#22d3ee"}
                    label={`${heroBestAgainst[heroId]?.rel_winrate > 0 ? "+" : ""}${(Math.round(heroBestAgainst[heroId]?.rel_winrate * 100)).toFixed(0)}% `}
                    delta={
                      prevCounterRelWinrateMap[heroId]?.[heroBestAgainst[heroId]?.enemy_hero_id] !== undefined
                        ? heroBestAgainst[heroId]?.rel_winrate -
                          prevCounterRelWinrateMap[heroId][heroBestAgainst[heroId]?.enemy_hero_id]
                        : undefined
                    }
                    tooltip={
                      <div className="flex flex-col gap-1 text-xs">
                        <div className="flex items-center gap-1.5 font-medium pb-1 mb-0.5 border-b border-border">
                          <HeroName heroId={heroId} />
                          <span className="text-muted-foreground">vs</span>
                          <HeroName heroId={heroBestAgainst[heroId]?.enemy_hero_id} />
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-muted-foreground">Matches</span>
                          <span className="font-medium">
                            {heroBestAgainst[heroId]?.matches_played.toLocaleString()}
                          </span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-muted-foreground">Wins</span>
                          <span className="font-medium">{heroBestAgainst[heroId]?.wins.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-muted-foreground">Win rate</span>
                          <span className="font-medium">
                            {((heroBestAgainst[heroId]?.wins / heroBestAgainst[heroId]?.matches_played) * 100).toFixed(
                              2,
                            )}
                            %
                          </span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-muted-foreground">Win rate change</span>
                          <span className="font-medium">
                            {heroBestAgainst[heroId]?.rel_winrate > 0 ? "+" : ""}
                            {(heroBestAgainst[heroId]?.rel_winrate * 100).toFixed(2)}%
                          </span>
                        </div>
                        {prevCounterRelWinrateMap[heroId]?.[heroBestAgainst[heroId]?.enemy_hero_id] !== undefined && (
                          <div className="flex justify-between gap-4 border-t border-border pt-1 mt-0.5">
                            <span className="text-muted-foreground">Previous</span>
                            <span className="font-medium">
                              {prevCounterRelWinrateMap[heroId][heroBestAgainst[heroId]?.enemy_hero_id] > 0 ? "+" : ""}
                              {(prevCounterRelWinrateMap[heroId][heroBestAgainst[heroId]?.enemy_hero_id] * 100).toFixed(
                                2,
                              )}
                              %
                            </span>
                          </div>
                        )}
                      </div>
                    }
                  />
                </div>
              </div>
            </TableCell>
            <TableCell>
              <div className="flex flex-col gap-2">
                <div key={heroWorstAgainst[heroId]?.enemy_hero_id} className="flex items-center gap-2">
                  <HeroImage heroId={heroWorstAgainst[heroId]?.enemy_hero_id} />
                  <ProgressBarWithLabel
                    min={heroMinWorstAgainstWinrate}
                    max={heroMaxWorstAgainstWinrate}
                    value={heroWorstAgainst[heroId]?.rel_winrate}
                    color={"#22d3ee"}
                    label={`${heroWorstAgainst[heroId]?.rel_winrate > 0 ? "+" : ""}${(Math.round(heroWorstAgainst[heroId]?.rel_winrate * 100)).toFixed(0)}% `}
                    delta={
                      prevCounterRelWinrateMap[heroId]?.[heroWorstAgainst[heroId]?.enemy_hero_id] !== undefined
                        ? heroWorstAgainst[heroId]?.rel_winrate -
                          prevCounterRelWinrateMap[heroId][heroWorstAgainst[heroId]?.enemy_hero_id]
                        : undefined
                    }
                    tooltip={
                      <div className="flex flex-col gap-1 text-xs">
                        <div className="flex items-center gap-1.5 font-medium pb-1 mb-0.5 border-b border-border">
                          <HeroName heroId={heroId} />
                          <span className="text-muted-foreground">vs</span>
                          <HeroName heroId={heroWorstAgainst[heroId]?.enemy_hero_id} />
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-muted-foreground">Matches</span>
                          <span className="font-medium">
                            {heroWorstAgainst[heroId]?.matches_played.toLocaleString()}
                          </span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-muted-foreground">Wins</span>
                          <span className="font-medium">{heroWorstAgainst[heroId]?.wins.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-muted-foreground">Win rate</span>
                          <span className="font-medium">
                            {(
                              (heroWorstAgainst[heroId]?.wins / heroWorstAgainst[heroId]?.matches_played) *
                              100
                            ).toFixed(2)}
                            %
                          </span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-muted-foreground">Win rate change</span>
                          <span className="font-medium">
                            {heroWorstAgainst[heroId]?.rel_winrate > 0 ? "+" : ""}
                            {(heroWorstAgainst[heroId]?.rel_winrate * 100).toFixed(2)}%
                          </span>
                        </div>
                        {prevCounterRelWinrateMap[heroId]?.[heroWorstAgainst[heroId]?.enemy_hero_id] !== undefined && (
                          <div className="flex justify-between gap-4 border-t border-border pt-1 mt-0.5">
                            <span className="text-muted-foreground">Previous</span>
                            <span className="font-medium">
                              {prevCounterRelWinrateMap[heroId][heroWorstAgainst[heroId]?.enemy_hero_id] > 0 ? "+" : ""}
                              {(
                                prevCounterRelWinrateMap[heroId][heroWorstAgainst[heroId]?.enemy_hero_id] * 100
                              ).toFixed(2)}
                              %
                            </span>
                          </div>
                        )}
                      </div>
                    }
                  />
                </div>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
