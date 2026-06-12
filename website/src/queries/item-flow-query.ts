import { queryOptions } from "@tanstack/react-query";

import { CACHE_DURATIONS } from "~/constants/cache";
import { api } from "~/lib/api";
import { API_ORIGIN } from "~/lib/constants";

import { queryKeys } from "./query-keys";

export type FlowGroupBy = "tier" | "time";

export interface ItemFlowNode {
  /** Tier (1-4) when `group_by=tier`, or phase index (0-based) when `group_by=time`. */
  column: number;
  item_id: number;
  wins: number;
  losses: number;
  matches: number;
  players: number;
  total_kills: number;
  total_deaths: number;
  total_assists: number;
}

export interface ItemFlowEdge {
  from_column: number;
  from_item_id: number;
  to_item_id: number;
  wins: number;
  losses: number;
  matches: number;
}

export interface ItemFlowStats {
  nodes: ItemFlowNode[];
  edges: ItemFlowEdge[];
}

export interface ItemFlowStatsParams {
  groupBy: FlowGroupBy;
  heroIds?: number[];
  gameMode?: string;
  minUnixTimestamp?: number;
  maxUnixTimestamp?: number;
  minAverageBadge?: number;
  maxAverageBadge?: number;
  minMatches?: number;
  /** Only used when `groupBy === "time"`. Length of each phase in seconds. */
  phaseIntervalS?: number;
  /** Only used when `groupBy === "time"`. Number of phases (columns). */
  phaseCount?: number;
}

function buildSearchParams(params: ItemFlowStatsParams): URLSearchParams {
  const sp = new URLSearchParams();
  sp.set("group_by", params.groupBy);
  if (params.heroIds?.length) sp.set("hero_ids", params.heroIds.join(","));
  if (params.gameMode) sp.set("game_mode", params.gameMode);
  if (params.minUnixTimestamp != null) sp.set("min_unix_timestamp", String(params.minUnixTimestamp));
  if (params.maxUnixTimestamp != null) sp.set("max_unix_timestamp", String(params.maxUnixTimestamp));
  if (params.minAverageBadge != null) sp.set("min_average_badge", String(params.minAverageBadge));
  if (params.maxAverageBadge != null) sp.set("max_average_badge", String(params.maxAverageBadge));
  if (params.minMatches != null) sp.set("min_matches", String(params.minMatches));
  if (params.groupBy === "time") {
    if (params.phaseIntervalS != null) sp.set("phase_interval_s", String(params.phaseIntervalS));
    if (params.phaseCount != null) sp.set("phase_count", String(params.phaseCount));
  }
  return sp;
}

export function itemFlowQueryOptions(params: ItemFlowStatsParams) {
  const search = buildSearchParams(params);
  return queryOptions({
    queryKey: queryKeys.analytics.itemFlowStats(search.toString()),
    queryFn: async () => {
      const response = await api.client.get<ItemFlowStats>(
        `${API_ORIGIN}/v1/analytics/item-flow-stats?${search.toString()}`,
      );
      return response.data;
    },
    staleTime: CACHE_DURATIONS.ONE_HOUR,
    refetchOnMount: "always",
  });
}
