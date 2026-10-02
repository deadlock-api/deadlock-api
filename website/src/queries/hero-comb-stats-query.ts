import { queryOptions } from "@tanstack/react-query";
import type { AnalyticsApiHeroCombStatsRequest } from "deadlock_api_client";

import { CACHE_DURATIONS } from "~/constants/cache";
import { api } from "~/lib/api";

import { queryKeys } from "./query-keys";

export function heroCombStatsQueryOptions(params: AnalyticsApiHeroCombStatsRequest) {
  return queryOptions({
    queryKey: queryKeys.analytics.heroCombStats(params),
    queryFn: async () => {
      const response = await api.analytics_api.heroCombStats(params);
      return response.data;
    },
    staleTime: CACHE_DURATIONS.ONE_DAY,
  });
}
