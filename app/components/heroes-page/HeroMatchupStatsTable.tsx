import { useQuery } from "@tanstack/react-query";
import type { AnalyticsHeroStats, HeroCounterStats, HeroSynergyStats } from "deadlock_api_client";
import { useMemo } from "react";
import HeroImage from "~/components/HeroImage";
import HeroName from "~/components/HeroName";
import { ProgressBarWithLabel } from "~/components/primitives/ProgressBar";
import type { Dayjs } from "~/dayjs";
import { api } from "~/lib/api";

export default function HeroMatchupStatsTable({
  hideHeader,
  minRankId,
  maxRankId,
  minMatches,
  minDate,
  maxDate,
  sameLaneFilter,
  samePartyFilter,
}: {
  hideHeader?: boolean;
  minRankId?: number;
  maxRankId?: number;
  minMatches?: number;
  minDate?: Dayjs;
  maxDate?: Dayjs;
  sameLaneFilter?: boolean;
  samePartyFilter?: boolean;
}) {
  const minDateTimestamp = useMemo(() => minDate?.unix(), [minDate]);
  const maxDateTimestamp = useMemo(() => maxDate?.unix(), [maxDate]);

  const { data: heroData, isLoading: isLoadingHero } = useQuery({
    queryKey: ["api-hero-stats", minRankId, maxRankId, minDateTimestamp, maxDateTimestamp, minMatches],
    queryFn: async () => {
      const response = await api.analytics_api.heroStats({
        minHeroMatches: minMatches,
        minAverageBadge: minRankId,
        maxAverageBadge: maxRankId,
        minUnixTimestamp: minDateTimestamp,
        maxUnixTimestamp: maxDateTimestamp,
      });
      return response.data;
    },
    staleTime: 24 * 60 * 60 * 1000, // 24 hours
  });

  const { data: synergyData, isLoading: isLoadingSynergy } = useQuery({
    queryKey: [
      "api-hero-synergy-stats",
      minRankId,
      maxRankId,
      minDateTimestamp,
      maxDateTimestamp,
      sameLaneFilter,
      samePartyFilter,
      minMatches,
    ],
    queryFn: async () => {
      const response = await api.analytics_api.heroSynergiesStats({
        sameLaneFilter: sameLaneFilter,
        samePartyFilter: samePartyFilter,
        minMatches: minMatches,
        minAverageBadge: minRankId,
        maxAverageBadge: maxRankId,
        minUnixTimestamp: minDateTimestamp,
        maxUnixTimestamp: maxDateTimestamp,
      });
      return response.data;
    },
    staleTime: 60 * 60 * 1000, // 1 hour
  });

  const { data: counterData, isLoading: isLoadingCounter } = useQuery({
    queryKey: [
      "api-hero-counter-stats",
      minRankId,
      maxRankId,
      minDateTimestamp,
      maxDateTimestamp,
      sameLaneFilter,
      minMatches,
    ],
    queryFn: async () => {
      const response = await api.analytics_api.heroCountersStats({
        sameLaneFilter: sameLaneFilter,
        minMatches: minMatches,
        minAverageBadge: minRankId,
        maxAverageBadge: maxRankId,
        minUnixTimestamp: minDateTimestamp,
        maxUnixTimestamp: maxDateTimestamp,
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
      if (!hero?.matches || !hero?.wins) continue;
      map[hero.hero_id] = hero;
    }
    return map;
  }, [heroData]);

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
      <div className="flex items-center justify-center w-full h-full">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-y-1 min-w-[800px]">
        {!hideHeader && (
          <thead>
            <tr className="bg-gray-800 text-center">
              <th className="p-2">#</th>
              <th className="p-2 text-left">Hero</th>
              <th className="p-2 text-left" title="Win Rate Increase/Decrease">
                Best Combination
              </th>
              <th className="p-2 text-left" title="Win Rate Increase/Decrease">
                Worst Combination
              </th>
              <th className="p-2 text-left" title="Win Rate Increase/Decrease">
                Best Against
              </th>
              <th className="p-2 text-left" title="Win Rate Increase/Decrease">
                Worst Against
              </th>
            </tr>
          </thead>
        )}
        <tbody>
          {heroIds?.map((heroId, index) => (
            <tr
              key={heroId}
              className="bg-gray-900 rounded-lg shadow border border-gray-800 hover:bg-gray-800 transition-all duration-200 text-center"
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
                      value={heroBestSynergies[heroId]?.rel_winrate}
                      color={"#ff00ff"}
                      label={`${heroBestSynergies[heroId]?.rel_winrate > 0 ? "+" : ""}${(Math.round(heroBestSynergies[heroId]?.rel_winrate * 100)).toFixed(0)}% `}
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
                      value={heroWorstSynergies[heroId]?.rel_winrate}
                      color={"#ff00ff"}
                      label={`${heroWorstSynergies[heroId]?.rel_winrate > 0 ? "+" : ""}${(Math.round(heroWorstSynergies[heroId]?.rel_winrate * 100)).toFixed(0)}% `}
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
                      value={heroBestAgainst[heroId]?.rel_winrate}
                      color={"#00ffff"}
                      label={`${heroBestAgainst[heroId]?.rel_winrate > 0 ? "+" : ""}${((Math.round(heroBestAgainst[heroId]?.rel_winrate * 100) / 100) * 100).toFixed(2)}% `}
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
                      value={heroWorstAgainst[heroId]?.rel_winrate}
                      color={"#00ffff"}
                      label={`${heroWorstAgainst[heroId]?.rel_winrate > 0 ? "+" : ""}${(Math.round(heroWorstAgainst[heroId]?.rel_winrate * 100)).toFixed(0)}% `}
                    />
                  </div>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
