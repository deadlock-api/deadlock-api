import { queryOptions } from "@tanstack/react-query";
import type { AnalyticsApiGameStatsRequest } from "deadlock_api_client/api";

import { CACHE_DURATIONS } from "~/constants/cache";
import { api } from "~/lib/api";

import { queryKeys } from "./query-keys";

export function gameStatsQueryOptions(gameStatsQuery: AnalyticsApiGameStatsRequest) {
  return queryOptions({
    queryKey: queryKeys.analytics.gameStats(gameStatsQuery),
    queryFn: async () => {
      const response = await api.analytics_api.gameStats(gameStatsQuery);
      return response.data;
    },
    staleTime: CACHE_DURATIONS.ONE_DAY,
  });
}
