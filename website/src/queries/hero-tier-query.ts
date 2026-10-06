import { type QueryClient, queryOptions } from "@tanstack/react-query";
import type { AnalyticsApiHeroBanStatsRequest, AnalyticsApiHeroStatsRequest } from "deadlock_api_client";

import { CACHE_DURATIONS } from "~/constants/cache";

import { heroBanStatsQueryOptions } from "./hero-ban-stats-query";
import { heroStatsQueryOptions } from "./hero-stats-query";
import { queryKeys } from "./query-keys";

/**
 * The hero stats and ban stats a tier list ranks on, as one value. Ranked separately, the list would be scored once
 * with the stats of one filter and the bans of another while the second answer is still on its way, and heroes would
 * jump between tiers; together they change at once. Both parts come from (and stay in) their own cache entries, which
 * the Overall table and the loader share; `initialData` takes them from there, so the server renders the list. Pass
 * `bans: null` where a mode has no bans. A failed ban request leaves `bans` undefined: the list ranks without them.
 */
export function heroTierInputsQueryOptions(
  queryClient: QueryClient,
  stats: AnalyticsApiHeroStatsRequest,
  bans: AnalyticsApiHeroBanStatsRequest | null,
) {
  const statsOptions = heroStatsQueryOptions(stats);
  const bansOptions = bans ? heroBanStatsQueryOptions(bans) : null;
  return queryOptions({
    queryKey: queryKeys.analytics.heroTierInputs(stats, bans),
    queryFn: async () => {
      const [statsRows, banRows] = await Promise.all([
        queryClient.query(statsOptions),
        bansOptions ? queryClient.query(bansOptions).catch(() => undefined) : undefined,
      ]);
      return { stats: statsRows, bans: banRows };
    },
    initialData: () => {
      const statsRows = queryClient.getQueryData(statsOptions.queryKey);
      const banRows = bansOptions ? queryClient.getQueryData(bansOptions.queryKey) : undefined;
      if (!statsRows || (bansOptions && !banRows)) return undefined;
      return { stats: statsRows, bans: banRows };
    },
    staleTime: CACHE_DURATIONS.ONE_HOUR,
  });
}
