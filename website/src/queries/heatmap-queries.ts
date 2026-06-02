import { queryOptions } from "@tanstack/react-query";
import type { AnalyticsApiKillDeathStatsRequest } from "deadlock_api_client";

import { CACHE_DURATIONS } from "~/constants/cache";
import { api } from "~/lib/api";

import { queryKeys } from "./query-keys";

export const mapQueryOptions = queryOptions({
  queryKey: queryKeys.map(),
  queryFn: async () => {
    const response = await api.map_api.getMap();
    return response.data;
  },
  staleTime: CACHE_DURATIONS.FOREVER,
});

export function killDeathStatsQueryOptions(params: AnalyticsApiKillDeathStatsRequest) {
  return queryOptions({
    queryKey: queryKeys.analytics.killDeathStats(params),
    queryFn: async () => {
      const response = await api.analytics_api.killDeathStats(params);
      return response.data;
    },
    staleTime: CACHE_DURATIONS.ONE_HOUR,
    refetchOnMount: "always",
  });
}
