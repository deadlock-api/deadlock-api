import { queryOptions } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import type { PlayerMatchHistoryEntry } from "deadlock_api_client";

import { CACHE_DURATIONS } from "~/constants/cache";
import { api } from "~/lib/api";
import { ensureCached } from "~/lib/prefetch-safe";
import { isDemoAccount } from "~/lib/tracker/demo";

import { playableHeroesQueryOptions } from "./asset-queries";
import { queryKeys } from "./query-keys";

/**
 * A player's match history. Bot-friend accounts hit a strict rate limit on the live Steam lookup; the API then answers
 * 429 with the stored ClickHouse history as the body, which is the history to show.
 */
async function fetchPlayerMatchHistory(accountId: number): Promise<PlayerMatchHistoryEntry[]> {
  try {
    const response = await api.players_api.matchHistory({ accountId });
    return response.data;
  } catch (error) {
    if (isAxiosError(error) && error.response?.status === 429 && Array.isArray(error.response.data)) {
      return error.response.data as PlayerMatchHistoryEntry[];
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
          ensureCached(client, playableHeroesQueryOptions),
        ]);
        return demoMatchHistory(
          heroes.map((hero) => hero.id),
          Date.now() / 1000,
        );
      }
      return fetchPlayerMatchHistory(accountId);
    },
    staleTime: CACHE_DURATIONS.FIVE_MINUTES,
  });
}
