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
import { API_ORIGIN } from "~/lib/constants";
import { graphql } from "~/lib/graphql";

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

interface TrackerMatchMetadata {
  winning_team: string | null | undefined;
  average_badge_team0: number | null | undefined;
  average_badge_team1: number | null | undefined;
  players: {
    account_id: number;
    team: string;
    hero_id: number;
    kills: number;
    deaths: number;
    assists: number;
    personaname: string | undefined;
  }[];
}

/** Shape of the protobuf-JSON `/v1/matches/{id}/metadata` response. Teams are `ECitadelLobbyTeam` numbers (0/1). */
interface RestMatchMetadata {
  match_info?: {
    winning_team?: number | null;
    average_badge_team0?: number | null;
    average_badge_team1?: number | null;
    players?: {
      account_id?: number;
      team?: number | null;
      hero_id?: number;
      kills?: number;
      deaths?: number;
      assists?: number;
    }[];
  };
}

/**
 * Fallback for matches the GraphQL (ClickHouse) side has not ingested yet: the
 * single metadata endpoint fetches on demand from Valve's replay CDN. It has no
 * steam names; the component backfills those via the steam profile endpoint.
 */
async function fetchTrackerMatchMetadataFromRest(matchId: number): Promise<TrackerMatchMetadata | null> {
  const response = await api.matches_api.metadata({ matchId });
  const info = (response.data as unknown as RestMatchMetadata).match_info;
  if (!info) return null;
  return {
    winning_team: info.winning_team == null ? null : `Team${info.winning_team}`,
    average_badge_team0: info.average_badge_team0,
    average_badge_team1: info.average_badge_team1,
    players: (info.players ?? []).map((player) => ({
      account_id: player.account_id ?? 0,
      team: player.team == null ? "" : `Team${player.team}`,
      hero_id: player.hero_id ?? 0,
      kills: player.kills ?? 0,
      deaths: player.deaths ?? 0,
      assists: player.assists ?? 0,
      personaname: undefined,
    })),
  };
}

export function trackerMatchMetadataQueryOptions(matchId: number) {
  return queryOptions({
    queryKey: queryKeys.players.matchMetadata(matchId),
    queryFn: async (): Promise<TrackerMatchMetadata | null> => {
      const { matches } = await graphql.query({
        matches: {
          __args: { where: { match_id: { eq: matchId } }, limit: 1 },
          winning_team: true,
          average_badge_team_0: true,
          average_badge_team_1: true,
          players: {
            account_id: true,
            team: true,
            hero_id: true,
            kills: true,
            deaths: true,
            assists: true,
            steam: { personaname: true },
          },
        },
      });
      const match = matches[0];
      if (!match) return fetchTrackerMatchMetadataFromRest(matchId);
      return {
        winning_team: match.winning_team,
        average_badge_team0: match.average_badge_team_0,
        average_badge_team1: match.average_badge_team_1,
        players: (match.players ?? []).map((player) => ({
          account_id: player.account_id ?? 0,
          team: player.team ?? "",
          hero_id: player.hero_id ?? 0,
          kills: player.kills ?? 0,
          deaths: player.deaths ?? 0,
          assists: player.assists ?? 0,
          personaname: player.steam?.personaname,
        })),
      };
    },
    staleTime: CACHE_DURATIONS.FOREVER,
  });
}
