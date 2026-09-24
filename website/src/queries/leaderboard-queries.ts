import { queryOptions } from "@tanstack/react-query";
import type { LeaderboardRegionEnum } from "deadlock_api_client";

import { CACHE_DURATIONS } from "~/constants/cache";
import { api } from "~/lib/api";

import { queryKeys } from "./query-keys";

export function leaderboardQueryOptions(region: LeaderboardRegionEnum, heroId?: number | null) {
  return queryOptions({
    queryKey: queryKeys.leaderboard.data(region, heroId),
    queryFn: async () => {
      const response = heroId
        ? await api.leaderboard_api.leaderboardHero({ region, heroId })
        : await api.leaderboard_api.leaderboard({ region });
      // The candidate account ids were 555 KB of the 630 KB the page embedded in its HTML, and nothing shows them.
      return {
        ...response.data,
        entries: response.data.entries.map(({ possible_account_ids: _unused, ...entry }) => entry),
      };
    },
    staleTime: CACHE_DURATIONS.ONE_HOUR,
  });
}
