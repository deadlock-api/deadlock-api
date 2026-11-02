import { queryOptions } from "@tanstack/react-query";
import type { Leaderboard, LeaderboardRegionEnum } from "deadlock_api_client";

import { CACHE_DURATIONS } from "~/constants/cache";
import { api } from "~/lib/api";

import { queryKeys } from "./query-keys";

/** A leaderboard as the page holds it: every entry without its candidate account ids. */
export type SlimLeaderboard = Omit<Leaderboard, "entries"> & {
  entries: Omit<Leaderboard["entries"][number], "possible_account_ids">[];
};

export function leaderboardQueryOptions(region: LeaderboardRegionEnum, heroId?: number | null) {
  return queryOptions({
    queryKey: queryKeys.leaderboard.data(region, heroId),
    queryFn: async (): Promise<SlimLeaderboard> => {
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
