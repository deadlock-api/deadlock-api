import { queryOptions } from "@tanstack/react-query";
import type { AnalyticsApiPlayerScoreboardRequest } from "deadlock_api_client/api";

import { CACHE_DURATIONS } from "~/constants/cache";
import { api } from "~/lib/api";

import { queryKeys } from "./query-keys";

export function playerScoreboardQueryOptions(params: AnalyticsApiPlayerScoreboardRequest) {
  return queryOptions({
    queryKey: queryKeys.analytics.playerScoreboard(params),
    queryFn: async () => {
      const response = await api.analytics_api.playerScoreboard(params);
      return response.data;
    },
    staleTime: CACHE_DURATIONS.ONE_HOUR,
  });
}
