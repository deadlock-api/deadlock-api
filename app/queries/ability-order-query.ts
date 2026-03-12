import { queryOptions } from "@tanstack/react-query";
import type { AnalyticsApiAbilityOrderStatsRequest } from "deadlock_api_client/api";

import { CACHE_DURATIONS } from "~/constants/cache";
import { api } from "~/lib/api";

import { queryKeys } from "./query-keys";

export function abilityOrderQueryOptions(params: AnalyticsApiAbilityOrderStatsRequest) {
  return queryOptions({
    queryKey: queryKeys.analytics.abilityOrderStats(params),
    queryFn: async () => {
      const response = await api.analytics_api.abilityOrderStats(params);
      return response.data;
    },
    staleTime: CACHE_DURATIONS.ONE_DAY,
  });
}
