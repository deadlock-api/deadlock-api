import { queryOptions } from "@tanstack/react-query";
import type { AnalyticsApiHeroStatsRequest, AnalyticsHeroStats } from "deadlock_api_client";

import { CACHE_DURATIONS } from "~/constants/cache";
import { api } from "~/lib/api";
import { packColumns, type PackedColumns, unpackColumns } from "~/lib/column-pack";

import { queryKeys } from "./query-keys";

export function heroStatsQueryOptions(params: AnalyticsApiHeroStatsRequest) {
  return queryOptions({
    queryKey: queryKeys.analytics.heroStats(params),
    queryFn: async () => {
      const response = await api.analytics_api.heroStats(params);
      return response.data;
    },
    staleTime: CACHE_DURATIONS.ONE_HOUR,
  });
}

/**
 * The fields the hero charts and the experience table read (`hero_stats_transform`'s and the bucket). `matches` is
 * left out: the API computes it as wins + losses, so unpacking derives it.
 */
const HERO_CHART_FIELDS = [
  "hero_id",
  "bucket",
  "wins",
  "losses",
  "total_kills",
  "total_deaths",
  "total_assists",
  "total_net_worth",
  "total_last_hits",
  "total_denies",
  "total_permanent_buffs",
  "permanent_buff_matches",
] as const satisfies readonly (keyof AnalyticsHeroStats)[];

type HeroChartField = (typeof HERO_CHART_FIELDS)[number];
export type HeroChartStats = Pick<AnalyticsHeroStats, HeroChartField | "matches">;
/** By rank also reads each bucket's match count, the base of its pick rates. */
export type HeroRankStats = HeroChartStats & Pick<AnalyticsHeroStats, "matches_per_bucket">;

const HERO_RANK_FIELDS = [...HERO_CHART_FIELDS, "matches_per_bucket"] as const;
type HeroRankField = (typeof HERO_RANK_FIELDS)[number];

function unpackHeroChartStats(packed: PackedColumns<HeroChartField>): HeroChartStats[] {
  return unpackColumns(packed).map((row) => Object.assign(row, { matches: row.wins + row.losses }));
}

function unpackHeroRankStats(packed: PackedColumns<HeroRankField>): HeroRankStats[] {
  return unpackColumns(packed).map((row) => Object.assign(row, { matches: row.wins + row.losses }));
}

/**
 * The by-rank view adds a hero's subtiers (Seeker 1-6) into their rank before it reads anything, so the cache keeps
 * one row per hero and rank, `bucket` being the rank times ten: a sixth of the 2,500 subtier rows. Every field is a
 * sum, `matches_per_bucket` included (the view adds it over the subtiers the hero was played in, as here).
 */
function sumByRank(rows: readonly AnalyticsHeroStats[]): Record<HeroRankField, number>[] {
  const byRank = new Map<string, Record<HeroRankField, number>>();
  for (const row of rows) {
    const rank = Math.floor(row.bucket / 10);
    const key = `${row.hero_id}:${rank}`;
    let sum = byRank.get(key);
    if (!sum) {
      sum = Object.fromEntries(HERO_RANK_FIELDS.map((field) => [field, 0])) as Record<HeroRankField, number>;
      sum.hero_id = row.hero_id;
      sum.bucket = rank * 10;
      byRank.set(key, sum);
    }
    for (const field of HERO_RANK_FIELDS) {
      if (field !== "hero_id" && field !== "bucket") sum[field] += row[field];
    }
  }
  return [...byRank.values()];
}

/**
 * /hero-stats for one heroes analytics view, cached packed and without the totals no view reads: the over-time
 * response is ~2,400 rows of 24 fields (1.4 MB), and the server dehydrates it into the page.
 */
export function heroChartStatsQueryOptions(
  view: "over-time" | "by-duration" | "by-experience",
  params: AnalyticsApiHeroStatsRequest,
) {
  return queryOptions({
    queryKey: queryKeys.analytics.heroChartStats(view, params),
    queryFn: async () => {
      const response = await api.analytics_api.heroStats(params);
      return packColumns(response.data, HERO_CHART_FIELDS);
    },
    select: unpackHeroChartStats,
    staleTime: CACHE_DURATIONS.ONE_DAY,
  });
}

/** `heroChartStatsQueryOptions` for the by-rank view: summed by rank, with each rank's match count. */
export function heroRankStatsQueryOptions(params: AnalyticsApiHeroStatsRequest) {
  return queryOptions({
    queryKey: queryKeys.analytics.heroChartStats("by-rank", params),
    queryFn: async () => {
      const response = await api.analytics_api.heroStats(params);
      return packColumns(sumByRank(response.data), HERO_RANK_FIELDS);
    },
    select: unpackHeroRankStats,
    staleTime: CACHE_DURATIONS.ONE_DAY,
  });
}
