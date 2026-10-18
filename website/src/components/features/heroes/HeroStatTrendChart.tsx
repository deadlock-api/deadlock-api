import { useQuery } from "@tanstack/react-query";
import type { AnalyticsApiHeroStatsRequest, AnalyticsApiHeroBanStatsRequest } from "deadlock_api_client";
import { useMemo } from "react";

import { PATCH_MARKERS_SHORT } from "~/components/domain/charts/PatchMarkers";
import StatTrendChart, { type StatTrendBucket } from "~/components/patterns/charts/StatTrendChart";
import { getPickrateMultiplier, MIN_MATCHES_PER_BUCKET } from "~/lib/constants";
import type { GameMode } from "~/lib/game-mode";
import { buildHeroTableTrend, HERO_TABLE_TRENDS, type HeroTableTrend } from "~/lib/hero-table-trends";
import { completeTimeBuckets } from "~/lib/time-buckets";
import { heroBanStatsQueryOptions } from "~/queries/hero-ban-stats-query";
import { heroStatsQueryOptions } from "~/queries/hero-stats-query";

export interface HeroStatTrendChartProps {
  params: Omit<AnalyticsApiHeroStatsRequest, "gameMode"> & { gameMode?: GameMode };
  heroId: number;
  stat: HeroTableTrend;
}

// The trend lives in a hover card, so it is read-only (a hover card's content is out of the tab order): one interval.
const BUCKET: StatTrendBucket = "start_time_day";

export default function HeroStatTrendChart({ params, heroId, stat }: HeroStatTrendChartProps) {
  const heroParams = { ...params, bucket: BUCKET };
  const needsHeroes = stat !== "banRate";
  const needsBans = params.gameMode !== "street_brawl" && ["banRate", "presence", "zScore", "residual"].includes(stat);
  const heroQuery = useQuery({ ...heroStatsQueryOptions(heroParams), enabled: needsHeroes });
  const banParams: AnalyticsApiHeroBanStatsRequest = {
    bucket: BUCKET,
    minAverageBadge: params.minAverageBadge,
    maxAverageBadge: params.maxAverageBadge,
    minUnixTimestamp: params.minUnixTimestamp,
    maxUnixTimestamp: params.maxUnixTimestamp,
    matchMode: params.matchMode,
  };
  const banQuery = useQuery({ ...heroBanStatsQueryOptions(banParams), enabled: needsBans });
  const normalizedPickrate = Boolean(params.minHeroMatches || params.minHeroMatchesTotal);
  const chartData = useMemo(() => {
    const range = { minUnixTimestamp: params.minUnixTimestamp, maxUnixTimestamp: params.maxUnixTimestamp };
    const heroes = completeTimeBuckets(heroQuery.data ?? [], BUCKET, range);
    const sampleSizes = heroes.map((hero) => hero.matches).sort((a, b) => a - b);
    const minMatchesPerBucket = Math.ceil(
      Math.max(MIN_MATCHES_PER_BUCKET, 0.1 * (sampleSizes[Math.floor(sampleSizes.length / 2)] ?? 0)),
    );
    return buildHeroTableTrend({
      heroes,
      bans: needsBans ? completeTimeBuckets(banQuery.data ?? [], BUCKET, range) : [],
      heroId,
      stat,
      pickrateMultiplier: getPickrateMultiplier(params.gameMode),
      normalizedPickrate,
      minMatchesPerBucket,
    });
  }, [
    heroQuery.data,
    banQuery.data,
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
      markers={PATCH_MARKERS_SHORT}
      state={
        (needsHeroes && heroQuery.isPending) || (needsBans && banQuery.isPending)
          ? "loading"
          : (needsHeroes && heroQuery.isError) || (needsBans && banQuery.isError)
            ? "error"
            : "ready"
      }
      stat={normalizedPickrate && stat === "pickRate" ? { ...definition, label: "Pick Rate (Normalized)" } : definition}
      value={BUCKET}
    />
  );
}
