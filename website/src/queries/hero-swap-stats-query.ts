import { queryOptions } from "@tanstack/react-query";
import type { AnalyticsApiHeroSwapStatsRequest } from "deadlock_api_client";

import { CACHE_DURATIONS } from "~/constants/cache";
import { api } from "~/lib/api";

import { queryKeys } from "./query-keys";

export function heroSwapStatsQueryOptions(params: AnalyticsApiHeroSwapStatsRequest) {
  return queryOptions({
    queryKey: queryKeys.analytics.heroSwapStats(params),
    queryFn: async () => {
      const response = await api.analytics_api.heroSwapStats(params);
      return response.data;
    },
    staleTime: CACHE_DURATIONS.ONE_HOUR,
  });
}
