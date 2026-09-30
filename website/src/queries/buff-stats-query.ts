import { queryOptions } from "@tanstack/react-query";
import type { AnalyticsApiBuffStatsRequest } from "deadlock_api_client";

import { CACHE_DURATIONS } from "~/constants/cache";
import { api } from "~/lib/api";

import { queryKeys } from "./query-keys";

export function buffStatsQueryOptions(params: AnalyticsApiBuffStatsRequest) {
  return queryOptions({
    queryKey: queryKeys.analytics.buffStats(params),
    queryFn: async () => {
      const response = await api.analytics_api.buffStats(params);
      return response.data;
    },
    staleTime: CACHE_DURATIONS.ONE_HOUR,
  });
}
