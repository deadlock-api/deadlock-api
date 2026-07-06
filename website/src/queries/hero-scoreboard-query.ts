import { queryOptions } from "@tanstack/react-query";
import type { AnalyticsApiHeroScoreboardRequest } from "deadlock_api_client";

import { CACHE_DURATIONS } from "~/constants/cache";
import { api } from "~/lib/api";

import { queryKeys } from "./query-keys";

export function heroScoreboardQueryOptions(params: AnalyticsApiHeroScoreboardRequest) {
  return queryOptions({
    queryKey: queryKeys.analytics.heroScoreboard(params),
    queryFn: async () => {
      const response = await api.analytics_api.heroScoreboard(params);
      return response.data;
    },
    staleTime: CACHE_DURATIONS.ONE_HOUR,
    refetchOnMount: "always",
  });
}
