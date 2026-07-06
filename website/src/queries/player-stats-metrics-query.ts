import { queryOptions } from "@tanstack/react-query";
import type { AnalyticsApiPlayerStatsMetricsRequest, HashMapValue } from "deadlock_api_client";

import { CACHE_DURATIONS } from "~/constants/cache";
import { api } from "~/lib/api";

import { queryKeys } from "./query-keys";

export function playerStatsMetricsQueryOptions(params: AnalyticsApiPlayerStatsMetricsRequest) {
  return queryOptions({
    queryKey: queryKeys.analytics.playerStatsMetrics(params),
    queryFn: async () => {
      const response = await api.analytics_api.playerStatsMetrics(params);
      return response.data as Record<string, HashMapValue>;
    },
    staleTime: CACHE_DURATIONS.ONE_HOUR,
    refetchOnMount: "always",
  });
}
