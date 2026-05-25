import { queryOptions } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import type { PlayerMatchHistoryEntry } from "deadlock_api_client";

import { UPDATE_INTERVAL_MS } from "~/constants/streamkit/widget";
import { api } from "~/lib/api";
import { API_ORIGIN } from "~/lib/constants";

import { queryKeys } from "./query-keys";

export function matchHistoryQueryOptions(accountId: string) {
  return queryOptions({
    queryKey: queryKeys.streamkit.matchHistory(accountId),
    queryFn: async () => {
      try {
        const response = await api.players_api.matchHistory({ accountId: Number(accountId) });
        return response.data;
      } catch (error) {
        // Bot-friend accounts hit a strict rate limit on the live endpoint; fall
        // back to the stored ClickHouse history, which is not rate limited.
        if (isAxiosError(error) && error.response?.status === 429) {
          const fallback = await api.client.get<PlayerMatchHistoryEntry[]>(
            `${API_ORIGIN}/v1/players/${accountId}/match-history`,
            { params: { only_stored_history: true } },
          );
          return fallback.data;
        }
        throw error;
      }
    },
    staleTime: UPDATE_INTERVAL_MS - 10000,
    refetchInterval: UPDATE_INTERVAL_MS,
    refetchIntervalInBackground: true,
  });
}
