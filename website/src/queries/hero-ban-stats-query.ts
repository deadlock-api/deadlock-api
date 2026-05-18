import { queryOptions } from "@tanstack/react-query";
import type { AnalyticsApiHeroBanStatsRequest } from "deadlock_api_client/api";

import { CACHE_DURATIONS } from "~/constants/cache";
import { api } from "~/lib/api";

import { queryKeys } from "./query-keys";

export function heroBanStatsQueryOptions(params: AnalyticsApiHeroBanStatsRequest) {
  return queryOptions({
    queryKey: queryKeys.analytics.heroBanStats(params),
    queryFn: async () => {
      const response = await api.analytics_api.heroBanStats(params);
      return response.data;
    },
    staleTime: CACHE_DURATIONS.ONE_DAY,
  });
}
