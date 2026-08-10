import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import type { AnalyticsApiLaneMatchupStatsRequest } from "deadlock_api_client";

import { CACHE_DURATIONS } from "~/constants/cache";
import { api } from "~/lib/api";

import { queryKeys } from "./query-keys";

export function laneMatchupStatsQueryOptions(params: AnalyticsApiLaneMatchupStatsRequest) {
  // Both sides scope the query server-side; without heroes on both sides the endpoint
  // would compute the full duo-vs-duo matrix, which is far too expensive to ask for here.
  const enabled = (params.heroIds?.length ?? 0) >= 2 && (params.enemyHeroIds?.length ?? 0) >= 2;
  return queryOptions({
    queryKey: queryKeys.analytics.laneMatchupStats(params),
    queryFn: async () => {
      const response = await api.analytics_api.laneMatchupStats(params);
      return response.data;
    },
    staleTime: CACHE_DURATIONS.ONE_HOUR,
    // Every pick changes the key. Without this the data blinks to `undefined` in between, which
    // rebuilds the whole stats index and re-runs the analysis twice per pick.
    placeholderData: keepPreviousData,
    enabled,
  });
}
