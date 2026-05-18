import { queryOptions } from "@tanstack/react-query";
import type { AnalyticsApiBadgeDistributionRequest } from "deadlock_api_client";

import { CACHE_DURATIONS } from "~/constants/cache";
import { api } from "~/lib/api";

import { queryKeys } from "./query-keys";

export function badgeDistributionQueryOptions(filter: AnalyticsApiBadgeDistributionRequest) {
  return queryOptions({
    queryKey: queryKeys.analytics.badgeDistribution(filter),
    queryFn: async () => {
      const response = await api.analytics_api.badgeDistribution(filter);
      return response.data;
    },
    staleTime: CACHE_DURATIONS.ONE_DAY,
  });
}
