import { queryOptions } from "@tanstack/react-query";
import type { AnalyticsApiHeroStatsRequest } from "deadlock_api_client/api";

import { CACHE_DURATIONS } from "~/constants/cache";
import { api } from "~/lib/api";

import { queryKeys } from "./query-keys";

export function heroStatsQueryOptions(params: AnalyticsApiHeroStatsRequest) {
  return queryOptions({
    queryKey: queryKeys.analytics.heroStats(params),
    queryFn: async () => {
      const response = await api.analytics_api.heroStats(params);
      return response.data;
    },
    staleTime: CACHE_DURATIONS.ONE_DAY,
  });
}
