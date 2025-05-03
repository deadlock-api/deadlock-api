import { useNavigate } from "@remix-run/react";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import HeroImage from "~/components/hero_image";
import HeroName from "~/components/hero_name";
import { ProgressBarWithLabel } from "~/components/progress_bar";
import type { APIHeroCounterStats } from "~/types/api_hero_counter_stats";
import type { APIHeroSynergyStats } from "~/types/api_hero_synergy_stats";

export default function HeroesMatchupStatsTable({
  hideHeader,
}: {
  hideHeader?: boolean;
}) {
  const navigate = useNavigate();

  const { data: synergyData, isLoading: isLoadingSynergy } = useQuery<APIHeroSynergyStats[]>({
    queryKey: ["api-hero-synergy-stats"],
    queryFn: () =>
      fetch("https://api.deadlock-api.com/v1/analytics/hero-synergy-stats?same_lane_filter=true").then((res) =>
        res.json(),
      ),
    staleTime: 60 * 60 * 1000, // 1 hour
  });

  const { data: counterData, isLoading: isLoadingCounter } = useQuery<APIHeroCounterStats[]>({
    queryKey: ["api-hero-counter-stats"],
    queryFn: () =>
      fetch("https://api.deadlock-api.com/v1/analytics/hero-counter-stats?same_lane_filter=true").then((res) =>
        res.json(),
      ),
    staleTime: 60 * 60 * 1000, // 1 hour
  });

  const isLoading = useMemo(() => isLoadingSynergy || isLoadingCounter, [isLoadingSynergy, isLoadingCounter]);

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

  const heroMinBestSynergyWinrate = useMemo(() => {
    if (Object.keys(heroBestSynergies).length === 0) return 0;
    return Math.min(...Object.values(heroBestSynergies).map((synergy) => synergy.wins / synergy.matches_played));
  }, [heroBestSynergies]);

  const heroMaxBestSynergyWinrate = useMemo(() => {
    if (Object.keys(heroBestSynergies).length === 0) return 0;
    return Math.max(...Object.values(heroBestSynergies).map((synergy) => synergy.wins / synergy.matches_played));
  }, [heroBestSynergies]);

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

  const heroMinWorstSynergyWinrate = useMemo(() => {
    if (Object.keys(heroWorstSynergies).length === 0) return 0;
    return Math.min(...Object.values(heroWorstSynergies).map((synergy) => synergy.wins / synergy.matches_played));
  }, [heroWorstSynergies]);

  const heroMaxWorstSynergyWinrate = useMemo(() => {
    if (Object.keys(heroWorstSynergies).length === 0) return 0;
    return Math.max(...Object.values(heroWorstSynergies).map((synergy) => synergy.wins / synergy.matches_played));
  }, [heroWorstSynergies]);

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

  const heroMinBestAgainstWinrate = useMemo(() => {
    if (Object.keys(heroBestAgainst).length === 0) return 0;
    return Math.min(...Object.values(heroBestAgainst).map((counter) => counter.wins / counter.matches_played));
  }, [heroBestAgainst]);

  const heroMaxBestAgainstWinrate = useMemo(() => {
    if (Object.keys(heroBestAgainst).length === 0) return 0;
    return Math.max(...Object.values(heroBestAgainst).map((counter) => counter.wins / counter.matches_played));
  }, [heroBestAgainst]);

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

  const heroMinWorstAgainstWinrate = useMemo(() => {
    if (Object.keys(heroWorstAgainst).length === 0) return 0;
    return Math.min(...Object.values(heroWorstAgainst).map((counter) => counter.wins / counter.matches_played));
  }, [heroWorstAgainst]);

  const heroMaxWorstAgainstWinrate = useMemo(() => {
    if (Object.keys(heroWorstAgainst).length === 0) return 0;
    return Math.max(...Object.values(heroWorstAgainst).map((counter) => counter.wins / counter.matches_played));
  }, [heroWorstAgainst]);

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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center w-full h-full">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <>
      <table className="w-full border-separate border-spacing-y-1">
        {!hideHeader && (
          <thead>
            <tr className="bg-gray-800 text-center">
              <th className="p-2">#</th>
              <th className="p-2 text-left">Hero</th>
              <th className="p-2 text-left">Best Combination</th>
              <th className="p-2 text-left">Worst Combination</th>
              <th className="p-2 text-left">Best Against</th>
              <th className="p-2 text-left">Worst Against</th>
            </tr>
          </thead>
        )}
        <tbody>
          {heroIds?.map((heroId, index) => (
            <tr
              key={heroId}
              className="bg-gray-900 rounded-lg shadow border border-gray-800 hover:bg-gray-800 transition-all duration-200 text-center hover:cursor-pointer"
              onClick={() => navigate(`/heroes?tab=hero-details&heroId=${heroId}`)}
            >
              <td className="p-2 align-middle font-semibold">{index + 1}</td>
              <td className="p-2 align-middle">
                <div className="flex items-center gap-2">
                  <HeroImage heroId={heroId} />
                  <HeroName heroId={heroId} />
                </div>
              </td>
              <td
                className="p-2 align-middle"
                title={`${heroBestSynergies[heroId]?.wins.toLocaleString()} wins / ${heroBestSynergies[heroId]?.matches_played.toLocaleString()} matches`}
              >
                <div className="flex flex-col gap-2">
                  <div key={heroBestSynergies[heroId]?.hero_id2} className="flex items-center gap-2">
                    <HeroImage heroId={heroBestSynergies[heroId]?.hero_id2} />
                    <ProgressBarWithLabel
                      min={heroMinBestSynergyWinrate}
                      max={heroMaxBestSynergyWinrate}
                      value={heroBestSynergies[heroId]?.wins / heroBestSynergies[heroId]?.matches_played}
                      color={"#ff00ff"}
                      label={`${(Math.round((heroBestSynergies[heroId]?.wins / heroBestSynergies[heroId]?.matches_played) * 100 * 100) / 100).toFixed(2)}% `}
                    />
                  </div>
                </div>
              </td>
              <td
                className="p-2 align-middle"
                title={`${heroWorstSynergies[heroId]?.wins.toLocaleString()} wins / ${heroWorstSynergies[heroId]?.matches_played.toLocaleString()} matches`}
              >
                <div className="flex flex-col gap-2">
                  <div key={heroWorstSynergies[heroId]?.hero_id2} className="flex items-center gap-2">
                    <HeroImage heroId={heroWorstSynergies[heroId]?.hero_id2} />
                    <ProgressBarWithLabel
                      min={heroMinWorstSynergyWinrate}
                      max={heroMaxWorstSynergyWinrate}
                      value={heroWorstSynergies[heroId]?.wins / heroWorstSynergies[heroId]?.matches_played}
                      color={"#ff00ff"}
                      label={`${(Math.round((heroWorstSynergies[heroId]?.wins / heroWorstSynergies[heroId]?.matches_played) * 100 * 100) / 100).toFixed(2)}% `}
                    />
                  </div>
                </div>
              </td>
              <td
                className="p-2 align-middle"
                title={`${heroBestAgainst[heroId]?.wins.toLocaleString()} wins / ${heroBestAgainst[heroId]?.matches_played.toLocaleString()} matches`}
              >
                <div className="flex flex-col gap-2">
                  <div key={heroBestAgainst[heroId]?.enemy_hero_id} className="flex items-center gap-2">
                    <HeroImage heroId={heroBestAgainst[heroId]?.enemy_hero_id} />
                    <ProgressBarWithLabel
                      min={heroMinBestAgainstWinrate}
                      max={heroMaxBestAgainstWinrate}
                      value={heroBestAgainst[heroId]?.wins / heroBestAgainst[heroId]?.matches_played}
                      color={"#00ffff"}
                      label={`${(Math.round((heroBestAgainst[heroId]?.wins / heroBestAgainst[heroId]?.matches_played) * 100 * 100) / 100).toFixed(2)}% `}
                    />
                  </div>
                </div>
              </td>
              <td
                className="p-2 align-middle"
                title={`${heroWorstAgainst[heroId]?.wins.toLocaleString()} wins / ${heroWorstAgainst[heroId]?.matches_played.toLocaleString()} matches`}
              >
                <div className="flex flex-col gap-2">
                  <div key={heroWorstAgainst[heroId]?.enemy_hero_id} className="flex items-center gap-2">
                    <HeroImage heroId={heroWorstAgainst[heroId]?.enemy_hero_id} />
                    <ProgressBarWithLabel
                      min={heroMinWorstAgainstWinrate}
                      max={heroMaxWorstAgainstWinrate}
                      value={heroWorstAgainst[heroId]?.wins / heroWorstAgainst[heroId]?.matches_played}
                      color={"#00ffff"}
                      label={`${(Math.round((heroWorstAgainst[heroId]?.wins / heroWorstAgainst[heroId]?.matches_played) * 100 * 100) / 100).toFixed(2)}% `}
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
