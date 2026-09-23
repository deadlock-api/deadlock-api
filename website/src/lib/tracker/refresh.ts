import type { QueryClient, QueryFilters } from "@tanstack/react-query";

import { queryKeys } from "~/queries/query-keys";

/** Account-scoped cache filter shared by refresh and its loading indicator. */
export function trackerAccountQueries(accountId: number): QueryFilters {
  const history = queryKeys.players.matchHistory(accountId)[0];
  const rank = queryKeys.players.rank(accountId)[0];
  const heroes = queryKeys.players.heroStats({ accountIds: [accountId] })[0];
  const mates = queryKeys.players.mateStats({ accountId })[0];
  const enemies = queryKeys.players.enemyStats({ accountId })[0];
  // The player's own benchmark values (RankBenchmarks), which new matches change too.
  const metrics = queryKeys.analytics.playerStatsMetrics({ accountIds: [accountId] })[0];

  return {
    predicate: ({ queryKey: [kind, scope] }) => {
      if (kind === history || kind === rank) return scope === accountId;
      if (scope == null || typeof scope !== "object") return false;
      if (kind === heroes || kind === metrics) {
        return "accountIds" in scope && Array.isArray(scope.accountIds) && scope.accountIds.includes(accountId);
      }
      return (kind === mates || kind === enemies) && "accountId" in scope && scope.accountId === accountId;
    },
  };
}

/** Refresh visible account data and mark its cached filter variants stale for their next visit. */
export function refreshTrackerAccount(queryClient: QueryClient, accountId: number) {
  return queryClient.invalidateQueries(trackerAccountQueries(accountId));
}
