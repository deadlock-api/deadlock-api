import { queryOptions } from "@tanstack/react-query";
import type { AnalyticsApiAbilityOrderStatsRequest, AnalyticsApiAbilityOrderTreeRequest } from "deadlock_api_client";

import { CACHE_DURATIONS } from "~/constants/cache";
import { packAbilityOrderTree, unpackAbilityOrderTree } from "~/lib/ability-order-utils";
import { api } from "~/lib/api";

import { queryKeys } from "./query-keys";

/** Whole ability orders, each with at least `minMatches` matches. For a tree of orders, use
 * `abilityOrderTreeQueryOptions`: most whole orders are rare, so these rows leave out about half the players. */
export function abilityOrderQueryOptions(params: AnalyticsApiAbilityOrderStatsRequest) {
  return queryOptions({
    queryKey: queryKeys.analytics.abilityOrderStats(params),
    queryFn: async () => (await api.analytics_api.abilityOrderStats(params)).data,
    staleTime: CACHE_DURATIONS.ONE_HOUR,
  });
}

// The cache holds the packed nodes, so the server dehydrates those into the page; observers read them unpacked.
export function abilityOrderTreeQueryOptions(params: AnalyticsApiAbilityOrderTreeRequest) {
  return queryOptions({
    queryKey: queryKeys.analytics.abilityOrderTree(params),
    queryFn: async () => {
      const response = await api.analytics_api.abilityOrderTree(params);
      return packAbilityOrderTree(response.data);
    },
    select: unpackAbilityOrderTree,
    staleTime: CACHE_DURATIONS.ONE_HOUR,
  });
}
