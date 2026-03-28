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
      return response.data;
    },
    staleTime: CACHE_DURATIONS.ONE_HOUR,
  });
}
