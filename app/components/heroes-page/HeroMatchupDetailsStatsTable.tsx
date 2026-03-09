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
import { cn } from "~/lib/utils";
import { queryKeys } from "~/queries/query-keys";

export enum HeroMatchupDetailsStatsTableStat {
  SYNERGY = 0,
  COUNTER = 1,
}

export default function HeroMatchupDetailsStatsTable({
  heroId,
  stat,
  minRankId,
  maxRankId,
  minDate,
  maxDate,
  onHeroSelected,
  sameLaneFilter,
  samePartyFilter,
  minHeroMatches,
  gameMode,
}: {
  heroId: number;
  stat: HeroMatchupDetailsStatsTableStat;
  minRankId?: number;
  maxRankId?: number;
  minDate?: Dayjs;
  maxDate?: Dayjs;
  onHeroSelected?: (heroId: number) => void;
  sameLaneFilter?: boolean;
  samePartyFilter?: boolean;
  minHeroMatches?: number;
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
      minHeroMatches,
      undefined,
      gameMode,
    ),
    queryFn: async () => {
      const response = await api.analytics_api.heroStats({
        minHeroMatches: minHeroMatches ?? 0,
        minAverageBadge: minRankId ?? 0,
        maxAverageBadge: maxRankId ?? 116,
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
      minHeroMatches,
      gameMode,
    ),
    queryFn: async () => {
      const response = await api.analytics_api.heroSynergiesStats({
        sameLaneFilter: sameLaneFilter,
        samePartyFilter: samePartyFilter,
        minMatches: minHeroMatches ?? 0,
        minAverageBadge: minRankId ?? 0,
        maxAverageBadge: maxRankId ?? 116,
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
      minHeroMatches,
      gameMode,
    ),
    queryFn: async () => {
      const response = await api.analytics_api.heroCountersStats({
        sameLaneFilter: sameLaneFilter,
        minMatches: minHeroMatches ?? 0,
        minAverageBadge: minRankId ?? 0,
        maxAverageBadge: maxRankId ?? 116,
        minUnixTimestamp: minDateTimestamp,
        maxUnixTimestamp: maxDateTimestamp,
        gameMode: gameMode,
      });
      return response.data;
    },
    staleTime: 60 * 60 * 1000, // 1 hour
  });

  const isLoading = useMemo(
    () => isLoadingSynergy || isLoadingCounter || isLoadingHero,
    [isLoadingSynergy, isLoadingCounter, isLoadingHero],
  );

  const heroStatsMap = useMemo(() => {
    const map: Record<number, AnalyticsHeroStats> = {};
    for (const hero of heroData || []) {
      map[hero.hero_id] = hero;
    }
    return map;
  }, [heroData]);

  const heroSynergies = useMemo(() => {
    const synergies: (Pick<HeroSynergyStats, "hero_id1" | "hero_id2" | "wins" | "matches_played"> & {
      rel_winrate: number;
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
        });
      }
    }
    synergies.sort((a, b) => b.rel_winrate - a.rel_winrate);
    return synergies;
  }, [heroId, synergyData, heroStatsMap]);

  const minSynergyWinrate = useMemo(() => {
    if (heroSynergies.length === 0) return 0;
    return Math.min(...heroSynergies.map((synergy) => synergy.rel_winrate));
  }, [heroSynergies]);

  const maxSynergyWinrate = useMemo(() => {
    if (heroSynergies.length === 0) return 0;
    return Math.max(...heroSynergies.map((synergy) => synergy.rel_winrate));
  }, [heroSynergies]);

  const heroCounters = useMemo(() => {
    const counters: (HeroCounterStats & { rel_winrate: number })[] = [];
    for (const counter of counterData || []) {
      if (counter.hero_id === heroId) {
        counters.push({
          ...counter,
          rel_winrate:
            counter?.wins / counter?.matches_played -
            heroStatsMap[counter.hero_id]?.wins / heroStatsMap[counter.hero_id]?.matches,
        });
      }
    }
    counters.sort((a, b) => b.wins / b.matches_played - a.wins / a.matches_played);
    return counters;
  }, [heroId, counterData, heroStatsMap]);

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
      <div className="flex items-center justify-center w-full h-full py-16">
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
                  label={`${synergy?.rel_winrate > 0 ? "+" : ""}${(Math.round(synergy?.rel_winrate * 100)).toFixed(0)}% `}
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
                  label={`${counter?.rel_winrate > 0 ? "+" : ""}${(Math.round(counter?.rel_winrate * 100)).toFixed(0)}% `}
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
