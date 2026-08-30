import { queryOptions } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import type {
  PlayerMatchHistoryEntry,
  PlayersApiEnemyStatsRequest,
  PlayersApiMateStatsRequest,
  PlayersApiPlayerHeroStatsRequest,
} from "deadlock_api_client";

import { CACHE_DURATIONS } from "~/constants/cache";
import { api } from "~/lib/api";
import type { BulkMatchMetadata } from "~/lib/build-transform";
import { API_ORIGIN } from "~/lib/constants";

import { queryKeys } from "./query-keys";

export function trackerMatchHistoryQueryOptions(accountId: number) {
  return queryOptions({
    queryKey: queryKeys.players.matchHistory(accountId),
    queryFn: async () => {
      try {
        const response = await api.players_api.matchHistory({ accountId });
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
    staleTime: CACHE_DURATIONS.FIVE_MINUTES,
  });
}

export function trackerRankQueryOptions(accountId: number) {
  return queryOptions({
    queryKey: queryKeys.players.rank(accountId),
    queryFn: async () => {
      const response = await api.players_api.rank({ accountId });
      return response.data;
    },
    staleTime: CACHE_DURATIONS.FIVE_MINUTES,
  });
}

export function trackerHeroStatsQueryOptions(params: PlayersApiPlayerHeroStatsRequest) {
  return queryOptions({
    queryKey: queryKeys.players.heroStats(params),
    queryFn: async () => {
      const response = await api.players_api.playerHeroStats(params);
      return response.data;
    },
    staleTime: CACHE_DURATIONS.FIVE_MINUTES,
  });
}

export function trackerMateStatsQueryOptions(params: PlayersApiMateStatsRequest) {
  return queryOptions({
    queryKey: queryKeys.players.mateStats(params),
    queryFn: async () => {
      const response = await api.players_api.mateStats(params);
      return response.data;
    },
    staleTime: CACHE_DURATIONS.FIVE_MINUTES,
  });
}

export function trackerEnemyStatsQueryOptions(params: PlayersApiEnemyStatsRequest) {
  return queryOptions({
    queryKey: queryKeys.players.enemyStats(params),
    queryFn: async () => {
      const response = await api.players_api.enemyStats(params);
      return response.data;
    },
    staleTime: CACHE_DURATIONS.FIVE_MINUTES,
  });
}

export function trackerMatchMetadataQueryOptions(matchId: number) {
  return queryOptions({
    queryKey: queryKeys.players.matchMetadata(matchId),
    queryFn: async () => {
      const response = await api.matches_api.bulkMetadata({
        includeInfo: true,
        includePlayerInfo: true,
        includePlayerKda: true,
        matchIds: [matchId],
        limit: 1,
      });
      const matches = response.data as unknown as BulkMatchMetadata[];
      return matches[0] ?? null;
    },
    staleTime: CACHE_DURATIONS.FOREVER,
  });
}
