import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import type { AnalyticsApiItemFlowStatsRequest, ItemFlowNode, ItemFlowStats } from "deadlock_api_client";

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
    placeholderData: keepPreviousData,
  });
}

/** Items per stage the build flow shows until the reader picks another count. */
export const ITEM_FLOW_DEFAULT_PER_COLUMN = 6;

/**
 * The part of a build flow answer its default view reads: per stage the most-bought items (the default sort and
 * count), one item of every tier bought there (the stage's tier toggles list the tiers present), the links between
 * shown items and the totals. Several megabytes shrink to a few kilobytes; the order of what is kept is unchanged.
 */
export function trimItemFlowForDefaultView(data: ItemFlowStats, tierOf: (itemId: number) => number): ItemFlowStats {
  const keep = new Set<ItemFlowNode>();
  const shown = new Set<string>();
  const columns = new Map<number, ItemFlowNode[]>();
  for (const node of data.nodes) {
    const column = columns.get(node.column);
    if (column) column.push(node);
    else columns.set(node.column, [node]);
  }
  for (const [column, nodes] of columns) {
    const byMatches = nodes.slice().sort((a, b) => b.matches - a.matches);
    for (const node of byMatches.slice(0, ITEM_FLOW_DEFAULT_PER_COLUMN)) {
      keep.add(node);
      shown.add(`${column}:${node.item_id}`);
    }
    const tiers = new Set<number>();
    for (const node of byMatches) {
      const tier = tierOf(node.item_id);
      if (tiers.has(tier)) continue;
      tiers.add(tier);
      keep.add(node);
    }
  }
  return {
    ...data,
    nodes: data.nodes.filter((node) => keep.has(node)),
    edges: data.edges.filter(
      (edge) =>
        shown.has(`${edge.from_column}:${edge.from_item_id}`) &&
        shown.has(`${edge.from_column + 1}:${edge.to_item_id}`),
    ),
  };
}
