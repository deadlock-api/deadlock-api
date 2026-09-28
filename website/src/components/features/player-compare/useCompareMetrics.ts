import { keepPreviousData, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import type { HashMapValue } from "deadlock_api_client";

import { type CompareFilters, compareMetricsParams, lastAnswerForAccount } from "~/queries/player-compare-queries";
import { playerStatsMetricsQueryOptions } from "~/queries/player-stats-metrics-query";

export type MetricAverages = Record<string, HashMapValue>;

export interface CompareMetrics {
  /** Every player's distribution of each metric on the filters: the field the players are ranked against. */
  population: MetricAverages | undefined;
  /** Each player's own metrics, in the players' order; undefined while loading or after a failure. */
  own: (MetricAverages | undefined)[];
  /** Per player: still loading (a placeholder from other filters counts as loaded). */
  pending: boolean[];
  /** Per player: failed with nothing to show. */
  failed: boolean[];
  populationPending: boolean;
  populationFailed: boolean;
  retrying: boolean;
  /** Refetches whatever failed. */
  retry: () => void;
}

/**
 * The population's metrics and each player's own, on the comparison's filters: one set of queries for the page, read
 * by the playstyle labels, the radar and the percentile curves. A filter change keeps the old numbers on screen
 * until the new ones arrive.
 */
export function useCompareMetrics(accountIds: readonly number[], filters: CompareFilters): CompareMetrics {
  const client = useQueryClient();
  const population = useQuery({
    ...playerStatsMetricsQueryOptions(compareMetricsParams(filters)),
    placeholderData: keepPreviousData,
  });
  const own = useQueries({
    queries: accountIds.map((accountId) => ({
      ...playerStatsMetricsQueryOptions(compareMetricsParams(filters, accountId)),
      placeholderData: lastAnswerForAccount<MetricAverages>(client, "api-player-stats-metrics", accountId),
    })),
  });
  return {
    population: population.data,
    own: own.map((query) => query.data),
    pending: own.map((query) => query.isPending),
    failed: own.map((query) => query.isError && !query.data),
    populationPending: population.isPending,
    populationFailed: population.isError && !population.data,
    retrying: population.isFetching || own.some((query) => query.isFetching),
    retry: () => {
      if (population.isError) void population.refetch();
      for (const query of own) if (query.isError) void query.refetch();
    },
  };
}
