import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import HeroImage from "~/components/hero_image";
import HeroName from "~/components/hero_name";
import { ProgressBarWithLabel } from "~/components/progress_bar";
import type { APIHeroCounterStats } from "~/types/api_hero_counter_stats";
import type { APIHeroSynergyStats } from "~/types/api_hero_synergy_stats";

export enum HeroMatchupStatsTableStat {
  SYNERGY = 0,
  COUNTER = 1,
}

export default function HeroMatchupStatsTable({
  heroId,
  stat,
}: {
  heroId: number;
  stat: HeroMatchupStatsTableStat;
}) {
  const { data: synergyData } = useQuery<APIHeroSynergyStats[]>({
    queryKey: ["api-hero-synergy-stats"],
    queryFn: () => fetch("https://api.deadlock-api.com/v1/analytics/hero-synergy-stats").then((res) => res.json()),
    staleTime: 60 * 60 * 1000, // 1 hour
  });

  const { data: counterData } = useQuery<APIHeroCounterStats[]>({
    queryKey: ["api-hero-counter-stats"],
    queryFn: () => fetch("https://api.deadlock-api.com/v1/analytics/hero-counter-stats").then((res) => res.json()),
    staleTime: 60 * 60 * 1000, // 1 hour
  });

  const heroSynergies = useMemo(() => {
    const synergies: APIHeroSynergyStats[] = [];
    for (const synergy of synergyData || []) {
      if (synergy.hero_id1 === heroId) {
        synergies.push(synergy);
      }
      if (synergy.hero_id2 === heroId) {
        synergies.push({
          hero_id1: synergy.hero_id2,
          hero_id2: synergy.hero_id1,
          wins: synergy.wins,
          matches_played: synergy.matches_played,
        });
      }
    }
    synergies.sort((a, b) => b.wins / b.matches_played - a.wins / a.matches_played);
    return synergies;
  }, [heroId, synergyData]);

  const minSynergyWinrate = useMemo(() => {
    if (heroSynergies.length === 0) return 0;
    return Math.min(...heroSynergies.map((synergy) => synergy.wins / synergy.matches_played));
  }, [heroSynergies]);

  const maxSynergyWinrate = useMemo(() => {
    if (heroSynergies.length === 0) return 0;
    return Math.max(...heroSynergies.map((synergy) => synergy.wins / synergy.matches_played));
  }, [heroSynergies]);

  const heroCounters = useMemo(() => {
    const counters: APIHeroCounterStats[] = [];
    for (const counter of counterData || []) {
      if (counter.hero_id === heroId) {
        counters.push(counter);
      }
    }
    counters.sort((a, b) => b.wins / b.matches_played - a.wins / a.matches_played);
    return counters;
  }, [heroId, counterData]);

  const minCounterWinrate = useMemo(() => {
    if (heroCounters.length === 0) return 0;
    return Math.min(...heroCounters.map((counter) => counter.wins / counter.matches_played));
  }, [heroCounters]);

  const maxCounterWinrate = useMemo(() => {
    if (heroCounters.length === 0) return 0;
    return Math.max(...heroCounters.map((counter) => counter.wins / counter.matches_played));
  }, [heroCounters]);

  function zip<T, U>(a: T[], b: U[]): [T, U][] {
    const length = Math.min(a.length, b.length);
    const result: [T, U][] = [];
    for (let i = 0; i < length; i++) {
      result.push([a[i], b[i]]);
    }
    return result;
  }

  return (
    <>
      <table className="w-full border-separate border-spacing-y-1">
        <thead>
          <tr className="bg-gray-800 text-center">
            <th className="px-4 py-3">#</th>
            <th className="px-4 py-3 text-left">Hero</th>
            {stat === HeroMatchupStatsTableStat.SYNERGY && <th className="px-4 py-3 text-left">Best Combination</th>}
            {stat === HeroMatchupStatsTableStat.COUNTER && <th className="px-4 py-3 text-left">Best Against</th>}
          </tr>
        </thead>
        <tbody>
          {zip(heroSynergies, heroCounters).map(([synergy, counter], index) => (
            <tr key={synergy.hero_id2} className="bg-gray-800 text-center">
              <td className="px-4 py-3">{index + 1}</td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  {stat === HeroMatchupStatsTableStat.SYNERGY && (
                    <>
                      <HeroImage heroId={synergy.hero_id2} />
                      <HeroName heroId={synergy.hero_id2} />
                    </>
                  )}
                  {stat === HeroMatchupStatsTableStat.COUNTER && (
                    <>
                      <HeroImage heroId={counter.enemy_hero_id} />
                      <HeroName heroId={counter.enemy_hero_id} />
                    </>
                  )}
                </div>
              </td>
              {stat === HeroMatchupStatsTableStat.SYNERGY && (
                <td className="px-4 py-3">
                  <ProgressBarWithLabel
                    min={minSynergyWinrate}
                    max={maxSynergyWinrate}
                    value={synergy.wins / synergy.matches_played}
                    color={"#ff00ff"}
                    label={`${(Math.round((synergy.wins / synergy.matches_played) * 100 * 100) / 100).toFixed(2)}% (${synergy.wins}/${synergy.matches_played})`}
                  />
                </td>
              )}
              {stat === HeroMatchupStatsTableStat.COUNTER && (
                <td className="px-4 py-3">
                  <ProgressBarWithLabel
                    min={minCounterWinrate}
                    max={maxCounterWinrate}
                    value={counter.wins / counter.matches_played}
                    color={"#00ffff"}
                    label={`${(Math.round((counter.wins / counter.matches_played) * 100 * 100) / 100).toFixed(2)}% (${counter.wins}/${counter.matches_played})`}
                  />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
