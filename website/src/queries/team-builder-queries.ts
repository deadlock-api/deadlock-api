import { queryOptions } from "@tanstack/react-query";
import type { AnalyticsApiHeroCountersStatsRequest, AnalyticsApiHeroSynergiesStatsRequest } from "deadlock_api_client";

import { CACHE_DURATIONS } from "~/constants/cache";
import { api } from "~/lib/api";

import { queryKeys } from "./query-keys";

/**
 * Both matrices are fetched whole rather than per drafted hero: the payload is a few thousand rows,
 * it is shared by every panel on the page, and it lets picks recompute without another round trip.
 */
export function draftSynergyStatsQueryOptions(params: AnalyticsApiHeroSynergiesStatsRequest) {
  return queryOptions({
    queryKey: queryKeys.analytics.heroSynergyStats(params),
    queryFn: async () => {
      const response = await api.analytics_api.heroSynergiesStats(params);
      return response.data;
    },
    staleTime: CACHE_DURATIONS.ONE_HOUR,
  });
}

export function draftCounterStatsQueryOptions(params: AnalyticsApiHeroCountersStatsRequest) {
  return queryOptions({
    queryKey: queryKeys.analytics.heroCounterStats(params),
    queryFn: async () => {
      const response = await api.analytics_api.heroCountersStats(params);
      return response.data;
    },
    staleTime: CACHE_DURATIONS.ONE_HOUR,
  });
}
