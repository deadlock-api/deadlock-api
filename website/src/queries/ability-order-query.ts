import { queryOptions } from "@tanstack/react-query";
import type { AnalyticsApiAbilityOrderStatsRequest } from "deadlock_api_client";

import { CACHE_DURATIONS } from "~/constants/cache";
import { packAbilityOrders, unpackAbilityOrders } from "~/lib/ability-order-utils";
import { api } from "~/lib/api";

import { queryKeys } from "./query-keys";

// The cache holds the packed rows, so the server dehydrates those into the page; observers read them unpacked.
export function abilityOrderQueryOptions(params: AnalyticsApiAbilityOrderStatsRequest) {
  return queryOptions({
    queryKey: queryKeys.analytics.abilityOrderStats(params),
    queryFn: async () => {
      const response = await api.analytics_api.abilityOrderStats(params);
      return packAbilityOrders(response.data);
    },
    select: unpackAbilityOrders,
    staleTime: CACHE_DURATIONS.ONE_HOUR,
  });
}
