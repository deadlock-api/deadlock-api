import { queryOptions } from "@tanstack/react-query";
import type { AnalyticsApiItemStatsRequest } from "deadlock_api_client/api";

import { CACHE_DURATIONS } from "~/constants/cache";
import { api } from "~/lib/api";

import { queryKeys } from "./query-keys";

export function itemStatsQueryOptions(itemStatsQuery: AnalyticsApiItemStatsRequest) {
  return queryOptions({
    queryKey: queryKeys.analytics.itemStats(itemStatsQuery),
    queryFn: async () => {
      const response = await api.analytics_api.itemStats(itemStatsQuery);
      return response.data;
    },
    staleTime: CACHE_DURATIONS.ONE_DAY,
  });
}
