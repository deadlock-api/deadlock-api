import { useQuery } from "@tanstack/react-query";
import type { Dayjs } from "dayjs";
import { useMemo } from "react";
import HeroImage from "~/components/HeroImage";
import HeroName from "~/components/HeroName";
import { ProgressBarWithLabel } from "~/components/primitives/ProgressBar";
import { cn } from "~/lib/utils";
import type { APIHeroCounterStats } from "~/types/api_hero_counter_stats";
import type { APIHeroStats } from "~/types/api_hero_stats";
import type { APIHeroSynergyStats } from "~/types/api_hero_synergy_stats";

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
}: {
  heroId: number;
  stat: HeroMatchupDetailsStatsTableStat;
  minRankId?: number;
  maxRankId?: number;
  minDate?: Dayjs | null;
  maxDate?: Dayjs | null;
  onHeroSelected?: (heroId: number) => void;
  sameLaneFilter?: boolean;
}) {
  const minDateTimestamp = useMemo(() => minDate?.unix(), [minDate]);
  const maxDateTimestamp = useMemo(() => maxDate?.unix(), [maxDate]);

  const { data: heroData, isLoading: isLoadingHero } = useQuery<APIHeroStats[]>({
    queryKey: ["api-hero-stats", minRankId, maxRankId, minDateTimestamp, maxDateTimestamp],
    queryFn: async () => {
      const url = new URL("https://api.deadlock-api.com/v1/analytics/hero-stats");
      url.searchParams.set("min_average_badge", (minRankId ?? 0).toString());
      url.searchParams.set("max_average_badge", (maxRankId ?? 116).toString());
      if (minDateTimestamp) url.searchParams.set("min_unix_timestamp", minDateTimestamp.toString());
      if (maxDateTimestamp) url.searchParams.set("max_unix_timestamp", maxDateTimestamp.toString());
      const res = await fetch(url);
      return await res.json();
    },
    staleTime: 24 * 60 * 60 * 1000, // 24 hours
  });

  const { data: synergyData, isLoading: isLoadingSynergy } = useQuery<APIHeroSynergyStats[]>({
    queryKey: ["api-hero-synergy-stats", minRankId, maxRankId, minDateTimestamp, maxDateTimestamp, sameLaneFilter],
    queryFn: async () => {
      const url = new URL("https://api.deadlock-api.com/v1/analytics/hero-synergy-stats");
      url.searchParams.set("same_lane_filter", sameLaneFilter?.toString() || "false");
      url.searchParams.set("min_average_badge", (minRankId ?? 0).toString());
      url.searchParams.set("max_average_badge", (maxRankId ?? 116).toString());
      if (minDateTimestamp) url.searchParams.set("min_unix_timestamp", minDateTimestamp.toString());
      if (maxDateTimestamp) url.searchParams.set("max_unix_timestamp", maxDateTimestamp.toString());
      const res = await fetch(url);
      return await res.json();
    },
    staleTime: 60 * 60 * 1000, // 1 hour
  });

  const { data: counterData, isLoading: isLoadingCounter } = useQuery<APIHeroCounterStats[]>({
    queryKey: ["api-hero-counter-stats", minRankId, maxRankId, minDateTimestamp, maxDateTimestamp, sameLaneFilter],
    queryFn: async () => {
      const url = new URL("https://api.deadlock-api.com/v1/analytics/hero-counter-stats");
      url.searchParams.set("same_lane_filter", sameLaneFilter?.toString() || "false");
      url.searchParams.set("min_average_badge", (minRankId ?? 0).toString());
      url.searchParams.set("max_average_badge", (maxRankId ?? 116).toString());
      if (minDateTimestamp) url.searchParams.set("min_unix_timestamp", minDateTimestamp.toString());
      if (maxDateTimestamp) url.searchParams.set("max_unix_timestamp", maxDateTimestamp.toString());
      const res = await fetch(url);
      return await res.json();
    },
    staleTime: 60 * 60 * 1000, // 1 hour
  });

  const isLoading = useMemo(
    () => isLoadingSynergy || isLoadingCounter || isLoadingHero,
    [isLoadingSynergy, isLoadingCounter, isLoadingHero],
  );

  const heroStatsMap = useMemo(() => {
    const map: Record<number, APIHeroStats> = {};
    for (const hero of heroData || []) {
      map[hero.hero_id] = hero;
    }
    return map;
  }, [heroData]);

  const heroSynergies = useMemo(() => {
    const synergies: (APIHeroSynergyStats & { rel_winrate: number })[] = [];
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
    const counters: (APIHeroCounterStats & { rel_winrate: number })[] = [];
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
      <div className="flex items-center justify-center w-full h-full">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-y-1 min-w-[500px]">
          <thead>
            <tr className="bg-gray-800 text-center">
              <th className="p-2">#</th>
              <th className="p-2 text-left">Hero</th>
              {stat === HeroMatchupDetailsStatsTableStat.SYNERGY && (
                <th className="p-2 text-left">Combination (Win Rate Change)</th>
              )}
              {stat === HeroMatchupDetailsStatsTableStat.COUNTER && (
                <th className="p-2 text-left">Against (Win Rate Change)</th>
              )}
            </tr>
          </thead>
          <tbody>
            {zip(heroSynergies, heroCounters).map(([synergy, counter], index) => (
              <tr
                key={stat === HeroMatchupDetailsStatsTableStat.SYNERGY ? synergy.hero_id2 : counter.enemy_hero_id}
                className={cn(
                  "bg-gray-900 rounded-lg shadow border border-gray-800 hover:bg-gray-800 transition-all duration-200 text-center",
                  onHeroSelected && "cursor-pointer",
                )}
                onClick={() =>
                  onHeroSelected?.(
                    stat === HeroMatchupDetailsStatsTableStat.SYNERGY ? synergy.hero_id2 : counter.enemy_hero_id,
                  )
                }
              >
                <td className="p-2">{index + 1}</td>
                <td className="p-2">
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
                </td>
                {stat === HeroMatchupDetailsStatsTableStat.SYNERGY && (
                  <td
                    className="p-2"
                    title={`${synergy?.wins.toLocaleString()} wins / ${synergy.matches_played.toLocaleString()} matches`}
                  >
                    <ProgressBarWithLabel
                      min={minSynergyWinrate}
                      max={maxSynergyWinrate}
                      value={synergy.rel_winrate}
                      color={"#ff00ff"}
                      label={`${synergy?.rel_winrate > 0 ? "+" : ""}${(Math.round(synergy?.rel_winrate * 100 * 100) / 100).toFixed(2)}% `}
                    />
                  </td>
                )}
                {stat === HeroMatchupDetailsStatsTableStat.COUNTER && (
                  <td
                    className="p-2"
                    title={`${counter?.wins.toLocaleString()} wins / ${counter?.matches_played.toLocaleString()} matches`}
                  >
                    <ProgressBarWithLabel
                      min={minCounterWinrate}
                      max={maxCounterWinrate}
                      value={counter.rel_winrate}
                      color={"#00ffff"}
                      label={`${counter?.rel_winrate > 0 ? "+" : ""}${(Math.round(counter?.rel_winrate * 100 * 100) / 100).toFixed(2)}% `}
                    />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
