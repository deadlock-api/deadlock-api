import { queryOptions } from "@tanstack/react-query";
import type { AnalyticsApiPlayerStatsMetricsRequest, HashMapValue } from "deadlock_api_client";

import { CACHE_DURATIONS } from "~/constants/cache";
import { api } from "~/lib/api";
import { isDemoAccount } from "~/lib/tracker/demo";

import { queryKeys } from "./query-keys";

export function playerStatsMetricsQueryOptions(params: AnalyticsApiPlayerStatsMetricsRequest) {
  return queryOptions({
    queryKey: queryKeys.analytics.playerStatsMetrics(params),
    queryFn: async () => {
      const demo = params.accountIds?.some(isDemoAccount) ?? false;
      const response = await api.analytics_api.playerStatsMetrics(demo ? { ...params, accountIds: undefined } : params);
      const metrics = response.data as Record<string, HashMapValue>;
      return demo ? (await import("~/lib/tracker/demo-data")).demoPlayerMetrics(metrics) : metrics;
    },
    staleTime: CACHE_DURATIONS.ONE_HOUR,
    refetchOnMount: "always",
  });
}
