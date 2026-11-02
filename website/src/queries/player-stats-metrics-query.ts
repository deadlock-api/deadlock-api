import { queryOptions } from "@tanstack/react-query";
import type { AnalyticsApiPlayerStatsMetricsRequest, MetricValues } from "deadlock_api_client";

import { CACHE_DURATIONS } from "~/constants/cache";
import { api } from "~/lib/api";
import { completeMetrics } from "~/lib/metric-distribution";
import { ensureCached } from "~/lib/prefetch-safe";
import { DEMO_ACCOUNT_ID, isDemoAccount } from "~/lib/tracker/demo";

import { trackerMatchHistoryQueryOptions } from "./match-history-queries";
import { queryKeys } from "./query-keys";

export function playerStatsMetricsQueryOptions(params: AnalyticsApiPlayerStatsMetricsRequest) {
  return queryOptions({
    queryKey: queryKeys.analytics.playerStatsMetrics(params),
    queryFn: async ({ client }) => {
      // The API does not know the demo account: its metrics come from its generated matches.
      if (params.accountIds?.some(isDemoAccount)) {
        const [{ demoPlayerMetrics }, history] = await Promise.all([
          import("~/lib/tracker/demo-data"),
          ensureCached(client, trackerMatchHistoryQueryOptions(DEMO_ACCOUNT_ID)),
        ]);
        return demoPlayerMetrics(history, params);
      }
      const response = await api.analytics_api.playerStatsMetrics(params);
      // Without `bucket` the response is one metrics object.
      return completeMetrics(response.data as Record<string, MetricValues>);
    },
    staleTime: CACHE_DURATIONS.ONE_HOUR,
  });
}
