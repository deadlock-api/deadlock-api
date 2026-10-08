import { queryOptions } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import type { PlayerMatchHistoryEntry } from "deadlock_api_client";

import { CACHE_DURATIONS } from "~/constants/cache";
import { api } from "~/lib/api";
import { API_ORIGIN } from "~/lib/constants";
import { isDemoAccount } from "~/lib/tracker/demo";

import { filterPlayableHeroes, heroesQueryOptions } from "./asset-queries";
import { queryKeys } from "./query-keys";

/**
 * A player's match history. Bot-friend accounts hit a strict rate limit on the live endpoint; a 429 falls back to the
 * stored ClickHouse history, which is not rate limited.
 */
export async function fetchPlayerMatchHistory(accountId: number): Promise<PlayerMatchHistoryEntry[]> {
  try {
    const response = await api.players_api.matchHistory({ accountId });
    return response.data;
  } catch (error) {
    if (isAxiosError(error) && error.response?.status === 429) {
      // The SDK has no `only_stored_history` parameter.
      const fallback = await api.client.get<PlayerMatchHistoryEntry[]>(
        `${API_ORIGIN}/v1/players/${accountId}/match-history`,
        { params: { only_stored_history: true } },
      );
      return fallback.data;
    }
    throw error;
  }
}

/** The match history the tracker and the Stream Kit widgets read; demo accounts get a generated one. */
export function trackerMatchHistoryQueryOptions(accountId: number) {
  return queryOptions({
    queryKey: queryKeys.players.matchHistory(accountId),
    queryFn: async ({ client }) => {
      if (isDemoAccount(accountId)) {
        const [{ demoMatchHistory }, heroes] = await Promise.all([
          import("~/lib/tracker/demo-data"),
          client.query({ ...heroesQueryOptions, staleTime: "static" }),
        ]);
        return demoMatchHistory(
          filterPlayableHeroes(heroes).map((hero) => hero.id),
          Date.now() / 1000,
        );
      }
      return fetchPlayerMatchHistory(accountId);
    },
    staleTime: CACHE_DURATIONS.FIVE_MINUTES,
  });
}
