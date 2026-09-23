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

/**
 * The generated client sends an array as a repeated key (`locked_item_ids=A&locked_item_ids=B`), which the API does
 * not pair up positionally with `locked_columns`: two locked items came back as 807 matches instead of 58,849. The
 * comma form it documents keeps each item with its column. Only the request changes; the cache key keeps the arrays.
 */
function commaSeparatedLocks(params: AnalyticsApiItemFlowStatsRequest): AnalyticsApiItemFlowStatsRequest {
  if (!params.lockedItemIds?.length || !params.lockedColumns?.length) return params;
  // One element that is already the comma list; the client writes it out as a single `key=a,b` pair.
  const joined = (values: number[]) => [values.join(",")] as unknown as number[];
  return { ...params, lockedItemIds: joined(params.lockedItemIds), lockedColumns: joined(params.lockedColumns) };
}

export function itemFlowQueryOptions(params: AnalyticsApiItemFlowStatsRequest) {
  const canonicalParams = sortLockedPath(params);
  return queryOptions({
    queryKey: queryKeys.analytics.itemFlowStats(canonicalParams),
    queryFn: async () => {
      const response = await api.analytics_api.itemFlowStats(commaSeparatedLocks(canonicalParams));
      return response.data;
    },
    staleTime: CACHE_DURATIONS.ONE_HOUR,
    refetchOnMount: "always",
    placeholderData: keepPreviousData,
  });
}
