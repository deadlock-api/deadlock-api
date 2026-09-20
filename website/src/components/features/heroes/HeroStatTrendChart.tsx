import { useQuery } from "@tanstack/react-query";
import type { AnalyticsApiHeroStatsRequest, AnalyticsApiHeroBanStatsRequest } from "deadlock_api_client";
import { useMemo } from "react";

import StatTrendChart, { type StatTrendBucket } from "~/components/patterns/charts/StatTrendChart";
import { CACHE_DURATIONS } from "~/constants/cache";
import { api } from "~/lib/api";
import { getPickrateMultiplier, MIN_MATCHES_PER_BUCKET } from "~/lib/constants";
import type { GameMode } from "~/lib/game-mode";
import { buildHeroTableTrend, HERO_TABLE_TRENDS, type HeroTableTrend } from "~/lib/hero-table-trends";
import { completeTimeBuckets } from "~/lib/time-buckets";
import { queryKeys } from "~/queries/query-keys";

export interface HeroStatTrendChartProps {
  params: Omit<AnalyticsApiHeroStatsRequest, "gameMode"> & { gameMode?: GameMode };
  heroId: number;
  stat: HeroTableTrend;
  bucket: StatTrendBucket;
  onBucketChange: (bucket: StatTrendBucket) => void;
}

export default function HeroStatTrendChart({ params, heroId, stat, bucket, onBucketChange }: HeroStatTrendChartProps) {
  const heroParams = { ...params, bucket };
  const needsHeroes = stat !== "banRate";
  const needsBans = params.gameMode !== "street_brawl" && ["banRate", "presence", "zScore", "residual"].includes(stat);
  const heroQuery = useQuery({
    queryKey: queryKeys.analytics.heroStatsOverTime(heroParams),
    queryFn: async () => (await api.analytics_api.heroStats(heroParams)).data,
    staleTime: CACHE_DURATIONS.ONE_DAY,
    enabled: needsHeroes,
  });
  const banParams: AnalyticsApiHeroBanStatsRequest = {
    bucket,
    minAverageBadge: params.minAverageBadge,
    maxAverageBadge: params.maxAverageBadge,
    minUnixTimestamp: params.minUnixTimestamp,
    maxUnixTimestamp: params.maxUnixTimestamp,
    matchMode: params.matchMode,
  };
  const banQuery = useQuery({
    queryKey: queryKeys.analytics.heroBanStats(banParams),
    queryFn: async () => (await api.analytics_api.heroBanStats(banParams)).data,
    staleTime: CACHE_DURATIONS.ONE_DAY,
    enabled: needsBans,
  });
  const normalizedPickrate = Boolean(params.minHeroMatches || params.minHeroMatchesTotal);
  const chartData = useMemo(() => {
    const range = { minUnixTimestamp: params.minUnixTimestamp, maxUnixTimestamp: params.maxUnixTimestamp };
    const heroes = completeTimeBuckets(heroQuery.data ?? [], bucket, range);
    const sampleSizes = heroes.map((hero) => hero.matches).sort((a, b) => a - b);
    const minMatchesPerBucket = Math.ceil(
      Math.max(MIN_MATCHES_PER_BUCKET, 0.1 * (sampleSizes[Math.floor(sampleSizes.length / 2)] ?? 0)),
    );
    return buildHeroTableTrend({
      heroes,
      bans: needsBans ? completeTimeBuckets(banQuery.data ?? [], bucket, range) : [],
      heroId,
      stat,
      pickrateMultiplier: getPickrateMultiplier(params.gameMode),
      normalizedPickrate,
      minMatchesPerBucket,
    });
  }, [
    heroQuery.data,
    banQuery.data,
    bucket,
    needsBans,
    heroId,
    stat,
    params.gameMode,
    params.minUnixTimestamp,
    params.maxUnixTimestamp,
    normalizedPickrate,
  ]);
  const definition = HERO_TABLE_TRENDS[stat];

  return (
    <StatTrendChart
      data={chartData}
      state={
        (needsHeroes && heroQuery.isPending) || (needsBans && banQuery.isPending)
          ? "loading"
          : (needsHeroes && heroQuery.isError) || (needsBans && banQuery.isError)
            ? "error"
            : "ready"
      }
      stat={normalizedPickrate && stat === "pickRate" ? { ...definition, label: "Pick Rate (Normalized)" } : definition}
      value={bucket}
      onValueChange={onBucketChange}
    />
  );
}
