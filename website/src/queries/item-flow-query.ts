import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import type { AnalyticsApiItemFlowStatsRequest } from "deadlock_api_client";

import { CACHE_DURATIONS } from "~/constants/cache";
import { api } from "~/lib/api";

import { queryKeys } from "./query-keys";

export type { ItemFlowEdge, ItemFlowNode, ItemFlowStats, ItemFlowSummary } from "deadlock_api_client";

function sortLockedPath(params: AnalyticsApiItemFlowStatsRequest): AnalyticsApiItemFlowStatsRequest {
  if (!params.lockedItemIds?.length || !params.lockedColumns?.length) return params;
  // Sort (item, column) pairs by item id so equivalent build paths share one cache entry.
  const pairs = params.lockedItemIds
    .map((id, i) => [id, params.lockedColumns?.[i] ?? 0] as const)
    .sort((a, b) => a[0] - b[0]);
  return {
    ...params,
    lockedItemIds: pairs.map((p) => p[0]),
    lockedColumns: pairs.map((p) => p[1]),
  };
}

export function itemFlowQueryOptions(params: AnalyticsApiItemFlowStatsRequest) {
  const canonicalParams = sortLockedPath(params);
  return queryOptions({
    queryKey: queryKeys.analytics.itemFlowStats(canonicalParams),
    queryFn: async () => {
      const response = await api.analytics_api.itemFlowStats(canonicalParams);
      return response.data;
    },
    staleTime: CACHE_DURATIONS.ONE_HOUR,
    refetchOnMount: "always",
    placeholderData: keepPreviousData,
  });
}
