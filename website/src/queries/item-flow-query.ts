import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import type { AnalyticsApiItemFlowStatsRequest, ItemFlowNode, ItemFlowStats } from "deadlock_api_client";

import { CACHE_DURATIONS } from "~/constants/cache";
import { api } from "~/lib/api";

import { queryKeys } from "./query-keys";

export type { ItemFlowEdge, ItemFlowNode, ItemFlowStats, ItemFlowSummary } from "deadlock_api_client";

function sortLockedPath(params: AnalyticsApiItemFlowStatsRequest): AnalyticsApiItemFlowStatsRequest {
  // Empty lists would still go out as `locked_item_ids=`, a URL of its own for the unlocked view.
  if (!params.lockedItemIds?.length || !params.lockedColumns?.length) {
    return { ...params, lockedItemIds: undefined, lockedColumns: undefined };
  }
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
    placeholderData: keepPreviousData,
  });
}

/** Items per stage the build flow offers to show. */
export const ITEM_FLOW_PER_COLUMN_OPTIONS = [8, 12, 20] as const;
/** Items per stage the build flow shows until the reader picks another count. */
export const ITEM_FLOW_DEFAULT_PER_COLUMN = ITEM_FLOW_PER_COLUMN_OPTIONS[0];
/** The item an empty stage of the build suggests is bought by at least this share of the build's players. */
export const ITEM_FLOW_NEXT_MIN_SHARE = 0.1;

/**
 * The part of a build flow answer its default view reads: per stage the most-bought items (the default sort and
 * count) and the items an empty stage may suggest, the links between kept items and the totals. Several megabytes
 * shrink to a few dozen kilobytes; the order of what is kept is unchanged.
 */
export function trimItemFlowForDefaultView(data: ItemFlowStats): ItemFlowStats {
  const keep = new Set<ItemFlowNode>();
  const keptKeys = new Set<string>();
  const columns = new Map<number, ItemFlowNode[]>();
  for (const node of data.nodes) {
    const column = columns.get(node.column);
    if (column) column.push(node);
    else columns.set(node.column, [node]);
  }
  for (const [column, nodes] of columns) {
    const byMatches = nodes.slice().sort((a, b) => b.matches - a.matches);
    const suggestable = byMatches.filter((node) => node.matches >= data.summary.matches * ITEM_FLOW_NEXT_MIN_SHARE);
    for (const node of [...byMatches.slice(0, ITEM_FLOW_DEFAULT_PER_COLUMN), ...suggestable]) {
      keep.add(node);
      keptKeys.add(`${column}:${node.item_id}`);
    }
  }
  return {
    ...data,
    nodes: data.nodes.filter((node) => keep.has(node)),
    edges: data.edges.filter(
      (edge) =>
        keptKeys.has(`${edge.from_column}:${edge.from_item_id}`) &&
        keptKeys.has(`${edge.from_column + 1}:${edge.to_item_id}`),
    ),
  };
}
