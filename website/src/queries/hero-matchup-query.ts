import { queryOptions } from "@tanstack/react-query";
import type {
  AnalyticsApiHeroCountersStatsRequest,
  AnalyticsApiHeroSynergiesStatsRequest,
  HeroCounterStats,
  HeroSynergyStats,
} from "deadlock_api_client";

import { CACHE_DURATIONS } from "~/constants/cache";
import { api } from "~/lib/api";
import { packColumns, type PackedColumns, unpackColumns } from "~/lib/column-pack";

import { queryKeys } from "./query-keys";

const SYNERGY_FIELDS = [
  "hero_id1",
  "hero_id2",
  "wins",
  "matches_played",
] as const satisfies readonly (keyof HeroSynergyStats)[];
const COUNTER_FIELDS = [
  "hero_id",
  "enemy_hero_id",
  "wins",
  "matches_played",
] as const satisfies readonly (keyof HeroCounterStats)[];

export type HeroSynergyWins = Pick<HeroSynergyStats, (typeof SYNERGY_FIELDS)[number]>;
export type HeroCounterWins = Pick<HeroCounterStats, (typeof COUNTER_FIELDS)[number]>;

const unpackSynergies = (packed: PackedColumns<(typeof SYNERGY_FIELDS)[number]>): HeroSynergyWins[] =>
  unpackColumns(packed);
const unpackCounters = (packed: PackedColumns<(typeof COUNTER_FIELDS)[number]>): HeroCounterWins[] =>
  unpackColumns(packed);

/**
 * Every hero pair's wins and matches as teammates. The response also carries 16 per-hero totals the matchup views never
 * read (~240 KB a period); the cache keeps the four fields packed, which is what the server embeds in the page.
 */
export function heroSynergyWinsQueryOptions(params: AnalyticsApiHeroSynergiesStatsRequest) {
  return queryOptions({
    queryKey: queryKeys.analytics.heroSynergyWins(params),
    queryFn: async () => {
      const response = await api.analytics_api.heroSynergiesStats(params);
      return packColumns(response.data, SYNERGY_FIELDS);
    },
    select: unpackSynergies,
    staleTime: CACHE_DURATIONS.ONE_HOUR,
  });
}

/** Every hero pair's wins and matches as opponents, packed like `heroSynergyWinsQueryOptions` (~540 KB a period raw). */
export function heroCounterWinsQueryOptions(params: AnalyticsApiHeroCountersStatsRequest) {
  return queryOptions({
    queryKey: queryKeys.analytics.heroCounterWins(params),
    queryFn: async () => {
      const response = await api.analytics_api.heroCountersStats(params);
      return packColumns(response.data, COUNTER_FIELDS);
    },
    select: unpackCounters,
    staleTime: CACHE_DURATIONS.ONE_HOUR,
  });
}
