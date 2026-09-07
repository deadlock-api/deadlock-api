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

export function steamProfileQueryOptions(accountId: number) {
  return queryOptions({
    queryKey: queryKeys.steam.profile(accountId),
    queryFn: async () => {
      const response = await api.steam_api.steam({ accountIds: [accountId] });
      return response.data[0] ?? null;
    },
    staleTime: CACHE_DURATIONS.ONE_DAY,
  });
}

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

export interface TrackerMatchItem {
  item_id: number;
  game_time_s: number;
  sold_time_s: number;
}

export interface TrackerMatchPlayer {
  account_id: number;
  team: string;
  hero_id: number;
  kills: number;
  deaths: number;
  assists: number;
  net_worth: number;
  last_hits: number;
  denies: number;
  level: number;
  player_damage: number;
  mvp_rank: number | null;
  items: TrackerMatchItem[];
  personaname: string | undefined;
}

export interface TrackerMatchMetadata {
  winning_team: string | null | undefined;
  average_badge_team0: number | null | undefined;
  average_badge_team1: number | null | undefined;
  players: TrackerMatchPlayer[];
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
      net_worth?: number;
      last_hits?: number;
      denies?: number;
      level?: number;
      mvp_rank?: number | null;
      items?: { item_id?: number; game_time_s?: number; sold_time_s?: number }[];
      stats?: { player_damage?: number }[];
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
      net_worth: player.net_worth ?? 0,
      last_hits: player.last_hits ?? 0,
      denies: player.denies ?? 0,
      level: player.level ?? 0,
      player_damage: player.stats?.at(-1)?.player_damage ?? 0,
      mvp_rank: player.mvp_rank ?? null,
      items: (player.items ?? []).map((item) => ({
        item_id: item.item_id ?? 0,
        game_time_s: item.game_time_s ?? 0,
        sold_time_s: item.sold_time_s ?? 0,
      })),
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
            net_worth: true,
            last_hits: true,
            denies: true,
            player_level: true,
            max_player_damage: true,
            mvp_rank: true,
            items: { item_id: true, game_time_s: true, sold_time_s: true },
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
          net_worth: player.net_worth ?? 0,
          last_hits: player.last_hits ?? 0,
          denies: player.denies ?? 0,
          level: player.player_level ?? 0,
          player_damage: player.max_player_damage ?? 0,
          mvp_rank: player.mvp_rank ?? null,
          items: (player.items ?? []).map((item) => ({
            item_id: item.item_id ?? 0,
            game_time_s: item.game_time_s ?? 0,
            sold_time_s: item.sold_time_s ?? 0,
          })),
          personaname: player.steam?.personaname,
        })),
      };
    },
    staleTime: CACHE_DURATIONS.FOREVER,
  });
}
