import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import HeroImage from "~/components/hero_image";
import HeroName from "~/components/hero_name";
import { ProgressBarWithLabel } from "~/components/progress_bar";
import type { APIHeroCounterStats } from "~/types/api_hero_counter_stats";
import type { APIHeroSynergyStats } from "~/types/api_hero_synergy_stats";

export default function HeroMatchupStatsTable({
  hideHeader,
}: {
  hideHeader?: boolean;
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

  const heroBestSynergies = useMemo(() => {
    function bestCombination(synergyMap: Record<number, APIHeroSynergyStats[]>, heroId: number) {
      if (!synergyMap[heroId]) return null;
      return synergyMap[heroId].sort((a, b) => b.wins / b.matches_played - a.wins / a.matches_played)[0];
    }

    const synergyMap: Record<number, APIHeroSynergyStats[]> = {};
    for (const synergy of synergyData || []) {
      if (!synergyMap[synergy.hero_id1]) synergyMap[synergy.hero_id1] = [];
      if (!synergyMap[synergy.hero_id2]) synergyMap[synergy.hero_id2] = [];
      synergyMap[synergy.hero_id1].push(synergy);
      synergyMap[synergy.hero_id2].push({
        hero_id1: synergy.hero_id2,
        hero_id2: synergy.hero_id1,
        wins: synergy.wins,
        matches_played: synergy.matches_played,
      });
    }
    const bestSynergies: Record<number, APIHeroSynergyStats> = {};
    for (const heroId of Object.keys(synergyMap)) {
      const heroIdParsed = Number.parseInt(heroId);
      const best = bestCombination(synergyMap, heroIdParsed);
      if (best) {
        bestSynergies[heroIdParsed] = best;
      }
    }
    return bestSynergies;
  }, [synergyData]);

  const heroWorstSynergies = useMemo(() => {
    function worstCombination(synergyMap: Record<number, APIHeroSynergyStats[]>, heroId: number) {
      if (!synergyMap[heroId]) return null;
      return synergyMap[heroId].sort((a, b) => a.wins / a.matches_played - b.wins / b.matches_played)[0];
    }

    const synergyMap: Record<number, APIHeroSynergyStats[]> = {};
    for (const synergy of synergyData || []) {
      if (!synergyMap[synergy.hero_id1]) synergyMap[synergy.hero_id1] = [];
      if (!synergyMap[synergy.hero_id2]) synergyMap[synergy.hero_id2] = [];
      synergyMap[synergy.hero_id1].push(synergy);
      synergyMap[synergy.hero_id2].push({
        hero_id1: synergy.hero_id2,
        hero_id2: synergy.hero_id1,
        wins: synergy.wins,
        matches_played: synergy.matches_played,
      });
    }
    const bestSynergies: Record<number, APIHeroSynergyStats> = {};
    for (const heroId of Object.keys(synergyMap)) {
      const heroIdParsed = Number.parseInt(heroId);
      const worst = worstCombination(synergyMap, heroIdParsed);
      if (worst) {
        bestSynergies[heroIdParsed] = worst;
      }
    }
    return bestSynergies;
  }, [synergyData]);

  const heroBestAgainst = useMemo(() => {
    function bestAgainst(counterMap: Record<number, APIHeroCounterStats[]>, heroId: number) {
      if (!counterMap[heroId]) return null;
      return counterMap[heroId].sort((a, b) => b.wins / b.matches_played - a.wins / a.matches_played)[0];
    }

    const counterMap: Record<number, APIHeroCounterStats[]> = {};
    for (const counter of counterData || []) {
      if (!counterMap[counter.hero_id]) counterMap[counter.hero_id] = [];
      counterMap[counter.hero_id].push(counter);
    }
    const bestCounters: Record<number, APIHeroCounterStats> = {};
    for (const heroId of Object.keys(counterMap)) {
      const heroIdParsed = Number.parseInt(heroId);
      const best = bestAgainst(counterMap, heroIdParsed);
      if (best) {
        bestCounters[heroIdParsed] = best;
      }
    }
    return bestCounters;
  }, [counterData]);

  const heroWorstAgainst = useMemo(() => {
    function worstAgainst(counterMap: Record<number, APIHeroCounterStats[]>, heroId: number) {
      if (!counterMap[heroId]) return null;
      return counterMap[heroId].sort((a, b) => a.wins / a.matches_played - b.wins / b.matches_played)[0];
    }

    const counterMap: Record<number, APIHeroCounterStats[]> = {};
    for (const counter of counterData || []) {
      if (!counterMap[counter.hero_id]) counterMap[counter.hero_id] = [];
      counterMap[counter.hero_id].push(counter);
    }
    const worstCounters: Record<number, APIHeroCounterStats> = {};
    for (const heroId of Object.keys(counterMap)) {
      const heroIdParsed = Number.parseInt(heroId);
      const worst = worstAgainst(counterMap, heroIdParsed);
      if (worst) {
        worstCounters[heroIdParsed] = worst;
      }
    }
    return worstCounters;
  }, [counterData]);

  const heroIds = useMemo(() => {
    const allHeroIds = new Set<number>();
    for (const heroId of Object.keys(heroBestSynergies)) {
      allHeroIds.add(Number.parseInt(heroId));
    }
    for (const heroId of Object.keys(heroBestAgainst)) {
      allHeroIds.add(Number.parseInt(heroId));
    }
    return Array.from(allHeroIds);
  }, [heroBestSynergies, heroBestAgainst]);

  return (
    <>
      <table className="w-full border-separate border-spacing-y-1">
        {!hideHeader && (
          <thead>
            <tr className="bg-gray-800 text-center">
              <th className="px-4 py-3">#</th>
              <th className="px-4 py-3 text-left">Hero</th>
              <th className="px-4 py-3 text-left">Best Combination</th>
              <th className="px-4 py-3 text-left">Worst Combination</th>
              <th className="px-4 py-3 text-left">Best Against</th>
              <th className="px-4 py-3 text-left">Worst Against</th>
            </tr>
          </thead>
        )}
        <tbody>
          {heroIds?.map((heroId, index) => (
            <tr
              key={heroId}
              className="bg-gray-900 rounded-lg shadow border border-gray-800 hover:bg-gray-800 transition-all duration-200 text-center"
            >
              <td className="px-4 py-3 align-middle font-semibold">{index + 1}</td>
              <td className="px-4 py-3 align-middle">
                <div className="flex items-center gap-3">
                  <HeroImage heroId={heroId} />
                  <HeroName heroId={heroId} />
                </div>
              </td>
              <td className="px-4 py-3 align-middle">
                <div className="flex flex-col gap-2">
                  <div key={heroBestSynergies[heroId]?.hero_id2} className="flex items-center gap-3">
                    <HeroImage heroId={heroBestSynergies[heroId]?.hero_id2} />
                    <ProgressBarWithLabel
                      min={0}
                      max={heroBestSynergies[heroId]?.matches_played}
                      value={heroBestSynergies[heroId]?.wins}
                      color={"#ff00ff"}
                      label={`${(Math.round((heroBestSynergies[heroId]?.wins / heroBestSynergies[heroId]?.matches_played) * 100 * 100) / 100).toFixed(2)}% `}
                    />
                  </div>
                </div>
              </td>
              <td className="px-4 py-3 align-middle">
                <div className="flex flex-col gap-2">
                  <div key={heroWorstSynergies[heroId]?.hero_id2} className="flex items-center gap-3">
                    <HeroImage heroId={heroWorstSynergies[heroId]?.hero_id2} />
                    <ProgressBarWithLabel
                      min={0}
                      max={heroWorstSynergies[heroId]?.matches_played}
                      value={heroWorstSynergies[heroId]?.wins}
                      color={"#ff00ff"}
                      label={`${(Math.round((heroWorstSynergies[heroId]?.wins / heroWorstSynergies[heroId]?.matches_played) * 100 * 100) / 100).toFixed(2)}% `}
                    />
                  </div>
                </div>
              </td>
              <td className="px-4 py-3 align-middle">
                <div className="flex flex-col gap-2">
                  <div key={heroBestAgainst[heroId]?.enemy_hero_id} className="flex items-center gap-3">
                    <HeroImage heroId={heroBestAgainst[heroId]?.enemy_hero_id} />
                    <ProgressBarWithLabel
                      min={0}
                      max={heroBestAgainst[heroId]?.matches_played}
                      value={heroBestAgainst[heroId]?.wins}
                      color={"#00ffff"}
                      label={`${(Math.round((heroBestAgainst[heroId]?.wins / heroBestAgainst[heroId]?.matches_played) * 100 * 100) / 100).toFixed(2)}% `}
                    />
                  </div>
                </div>
              </td>
              <td className="px-4 py-3 align-middle">
                <div className="flex flex-col gap-2">
                  <div key={heroWorstAgainst[heroId]?.enemy_hero_id} className="flex items-center gap-3">
                    <HeroImage heroId={heroWorstAgainst[heroId].enemy_hero_id} />
                    <ProgressBarWithLabel
                      min={0}
                      max={heroWorstAgainst[heroId].matches_played}
                      value={heroWorstAgainst[heroId].wins}
                      color={"#00ffff"}
                      label={`${(Math.round((heroWorstAgainst[heroId].wins / heroWorstAgainst[heroId].matches_played) * 100 * 100) / 100).toFixed(2)}% `}
                    />
                  </div>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
