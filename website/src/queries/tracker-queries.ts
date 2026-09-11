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
import { graphql, isGraphqlRateLimited } from "~/lib/graphql";

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
  /** Non-zero on an ability's upgrades; zero on its unlock and on shop items. */
  upgrade_id: number;
  /** The ability a shop item was imbued into, or 0. */
  imbued_ability_id: number;
}

/** One stats sample; every count is cumulative from the match start. */
export interface TrackerMatchStat {
  time_stamp_s: number;
  net_worth: number;
  kills: number;
  deaths: number;
  assists: number;
  /** Lane creeps last hit. */
  creep_kills: number;
  denies: number;
  player_damage: number;
}

export interface TrackerMatchDeath {
  game_time_s: number;
  /** `player_slot` of the killer; null when no player was credited, e.g. a guardian or creep kill. */
  killer_player_slot: number | null;
  death_duration_s: number;
  time_to_kill_s: number;
}

export interface TrackerPlayerDeaths {
  account_id: number;
  /** 1-12; `TrackerMatchDeath.killer_player_slot` refers to it. */
  player_slot: number;
  death_details: TrackerMatchDeath[];
}

export interface TrackerMatchPlayer {
  account_id: number;
  team: string;
  hero_id: number;
  /** `LANES` id, or 0 when the game assigned none. */
  assigned_lane: number;
  kills: number;
  deaths: number;
  assists: number;
  net_worth: number;
  level: number;
  last_hits: number;
  denies: number;
  player_damage: number;
  player_damage_taken: number;
  boss_damage: number;
  player_healing: number;
  mvp_rank: number | null;
  /** Ranked badge going into the match, or null when unknown or unranked. */
  rank_badge: number | null;
  /** Ranked progress the match actually moved, or null when it carried no rank progress. */
  rank_delta: number | null;
  /** Whether demotion protection absorbed this match's loss. */
  demotion_protected: boolean;
  /** Stacks built over the match by ability or item id, for those that stack, e.g. Sticky Bomb or Trophy Collector. */
  ability_stacks: Record<number, number>;
  items: TrackerMatchItem[];
  stats: TrackerMatchStat[];
  personaname: string | undefined;
}

/**
 * Objective tiers on the current map. The Patron falls in two phases: the game's `Titan` is its first, after which
 * it fights on, and its `Core` is the final one, whose destruction ends the match.
 */
export type TrackerObjectiveKind = "guardian" | "walker" | "baseGuardian" | "shrine" | "patron" | "patronCore";

export interface TrackerObjective {
  /** The team that owned (and lost) the objective. */
  team: string;
  kind: TrackerObjectiveKind;
  destroyed_time_s: number;
}

export interface TrackerMidBoss {
  team_claimed: string;
  destroyed_time_s: number;
}

export interface TrackerMatchMetadata {
  winning_team: string | null | undefined;
  average_badge_team0: number | null | undefined;
  average_badge_team1: number | null | undefined;
  players: TrackerMatchPlayer[];
  /** Destroyed objectives only. */
  objectives: TrackerObjective[];
  mid_boss: TrackerMidBoss[];
  /** Every player's deaths, keyed by the player slots killers are credited by. */
  deaths: TrackerPlayerDeaths[];
}

/** Shape of the protobuf-JSON `/v1/matches/{id}/metadata` response. Teams are `ECitadelLobbyTeam` numbers (0/1). */
interface RestMatchMetadata {
  match_info?: {
    winning_team?: number | null;
    average_badge_team0?: number | null;
    average_badge_team1?: number | null;
    objectives?: { team?: number | null; team_objective_id?: number | null; destroyed_time_s?: number | null }[];
    mid_boss?: { team_claimed?: number | null; destroyed_time_s?: number | null }[];
    players?: {
      account_id?: number;
      player_slot?: number;
      team?: number | null;
      hero_id?: number;
      assigned_lane?: number | null;
      kills?: number;
      deaths?: number;
      assists?: number;
      net_worth?: number;
      level?: number;
      last_hits?: number;
      denies?: number;
      mvp_rank?: number | null;
      ability_stats?: { ability_id?: number; ability_value?: number }[] | null;
      player_rank_data?: {
        initial_display_rank?: number | null;
        initial_flat_progress?: number | null;
        final_flat_progress?: number | null;
        consumed_demotion_protection?: boolean | null;
      } | null;
      items?: {
        item_id?: number;
        game_time_s?: number;
        sold_time_s?: number;
        upgrade_id?: number;
        imbued_ability_id?: number;
      }[];
      death_details?: RawDeath[] | null;
      stats?: {
        time_stamp_s?: number;
        net_worth?: number;
        kills?: number;
        deaths?: number;
        assists?: number;
        creep_kills?: number;
        denies?: number;
        player_damage?: number;
        player_damage_taken?: number;
        boss_damage?: number;
        player_healing?: number;
      }[];
    }[];
  };
}

/** `death_details` entries, spelled the same in the REST and GraphQL payloads. */
interface RawDeath {
  game_time_s?: number | null;
  killer_player_slot?: number | null;
  death_duration_s?: number | null;
  time_to_kill_s?: number | null;
}

function playerDeaths(player: {
  account_id?: number | null;
  player_slot?: number | null;
  death_details?: unknown;
}): TrackerPlayerDeaths {
  return {
    account_id: player.account_id ?? 0,
    player_slot: player.player_slot ?? 0,
    death_details: deathDetails(player.death_details as RawDeath[] | null | undefined),
  };
}

function deathDetails(raw: RawDeath[] | null | undefined): TrackerMatchDeath[] {
  return (raw ?? []).map((death) => ({
    game_time_s: death.game_time_s ?? 0,
    killer_player_slot: death.killer_player_slot || null,
    death_duration_s: death.death_duration_s ?? 0,
    time_to_kill_s: death.time_to_kill_s ?? 0,
  }));
}

/** Cumulative stats peak at the final sample, whichever order the timeline arrives in. */
function maxStat(stats: { [key: string]: number | null | undefined }[] | undefined, key: string): number {
  let max = 0;
  for (const stat of stats ?? []) max = Math.max(max, stat[key] ?? 0);
  return max;
}

function toTrackerStat(stat: { [key in keyof TrackerMatchStat]?: number | null }): TrackerMatchStat {
  return {
    time_stamp_s: stat.time_stamp_s ?? 0,
    net_worth: stat.net_worth ?? 0,
    kills: stat.kills ?? 0,
    deaths: stat.deaths ?? 0,
    assists: stat.assists ?? 0,
    creep_kills: stat.creep_kills ?? 0,
    denies: stat.denies ?? 0,
    player_damage: stat.player_damage ?? 0,
  };
}

/** The progress a match applied, which demotion protection can hold at zero against the change the result asked for. */
function rankDelta(initial: number | null | undefined, final: number | null | undefined): number | null {
  if (initial == null || final == null || (initial === 0 && final === 0)) return null;
  return final - initial;
}

const restTeam = (team: number | null | undefined) => (team == null ? "" : `Team${team}`);

/** `ECitadelTeamObjective`: 0 Core, 1-4 Tier1 lanes, 5-8 Tier2 lanes, 9 Titan, 10-11 shield generators, 12-15 barrack bosses. */
const REST_OBJECTIVE_KINDS: (TrackerObjectiveKind | undefined)[] = [
  "patronCore",
  ...Array<TrackerObjectiveKind>(4).fill("guardian"),
  ...Array<TrackerObjectiveKind>(4).fill("walker"),
  "patron",
  "shrine",
  "shrine",
  ...Array<TrackerObjectiveKind>(4).fill("baseGuardian"),
];

/** GraphQL spells the same enum out, e.g. `Tier1Lane1`, `BarrackBossLane4`, `TitanShieldGenerator2`, `Titan`, `Core`. */
function graphqlObjectiveKind(name: string): TrackerObjectiveKind | undefined {
  if (name.startsWith("Tier1")) return "guardian";
  if (name.startsWith("Tier2")) return "walker";
  if (name.startsWith("BarrackBoss")) return "baseGuardian";
  if (name.startsWith("TitanShieldGenerator")) return "shrine";
  if (name === "Titan") return "patron";
  if (name === "Core") return "patronCore";
  return undefined;
}

function destroyedObjectives<T extends { destroyed_time_s?: number | null }>(
  raw: T[] | null | undefined,
  classify: (entry: T) => { team: string; kind: TrackerObjectiveKind | undefined },
): TrackerObjective[] {
  const objectives: TrackerObjective[] = [];
  for (const entry of raw ?? []) {
    const { team, kind } = classify(entry);
    if (kind && entry.destroyed_time_s) objectives.push({ team, kind, destroyed_time_s: entry.destroyed_time_s });
  }
  return objectives;
}

function claimedMidBosses<T extends { destroyed_time_s?: number | null }>(
  raw: T[] | null | undefined,
  teamOf: (entry: T) => string,
): TrackerMidBoss[] {
  return (raw ?? [])
    .filter((entry) => entry.destroyed_time_s)
    .map((entry) => ({ team_claimed: teamOf(entry), destroyed_time_s: entry.destroyed_time_s as number }));
}

/**
 * Fallback for matches the GraphQL (ClickHouse) side has not ingested yet: the
 * single metadata endpoint fetches on demand from Valve's replay CDN. It has no
 * steam names; the component backfills those via the steam profile endpoint.
 */
async function fetchRestMatchInfo(matchId: number): Promise<RestMatchMetadata["match_info"]> {
  const response = await api.matches_api.metadata({ matchId });
  return (response.data as unknown as RestMatchMetadata).match_info;
}

async function fetchTrackerMatchMetadataFromRest(matchId: number): Promise<TrackerMatchMetadata | null> {
  const info = await fetchRestMatchInfo(matchId);
  if (!info) return null;
  return {
    winning_team: info.winning_team == null ? null : restTeam(info.winning_team),
    average_badge_team0: info.average_badge_team0,
    average_badge_team1: info.average_badge_team1,
    objectives: destroyedObjectives(info.objectives, (objective) => ({
      team: restTeam(objective.team),
      kind: REST_OBJECTIVE_KINDS[objective.team_objective_id ?? -1],
    })),
    mid_boss: claimedMidBosses(info.mid_boss, (boss) => restTeam(boss.team_claimed)),
    deaths: (info.players ?? []).map(playerDeaths),
    players: (info.players ?? []).map((player) => ({
      account_id: player.account_id ?? 0,
      team: restTeam(player.team),
      hero_id: player.hero_id ?? 0,
      assigned_lane: player.assigned_lane ?? 0,
      kills: player.kills ?? 0,
      deaths: player.deaths ?? 0,
      assists: player.assists ?? 0,
      net_worth: player.net_worth ?? 0,
      level: player.level ?? 0,
      last_hits: player.last_hits ?? 0,
      denies: player.denies ?? 0,
      player_damage: maxStat(player.stats, "player_damage"),
      player_damage_taken: maxStat(player.stats, "player_damage_taken"),
      boss_damage: maxStat(player.stats, "boss_damage"),
      player_healing: maxStat(player.stats, "player_healing"),
      mvp_rank: player.mvp_rank ?? null,
      rank_badge: player.player_rank_data?.initial_display_rank || null,
      rank_delta: rankDelta(
        player.player_rank_data?.initial_flat_progress,
        player.player_rank_data?.final_flat_progress,
      ),
      demotion_protected: player.player_rank_data?.consumed_demotion_protection === true,
      ability_stacks: Object.fromEntries(
        (player.ability_stats ?? []).map((stat) => [stat.ability_id ?? 0, stat.ability_value ?? 0]),
      ),
      items: (player.items ?? []).map((item) => ({
        item_id: item.item_id ?? 0,
        game_time_s: item.game_time_s ?? 0,
        sold_time_s: item.sold_time_s ?? 0,
        upgrade_id: item.upgrade_id ?? 0,
        imbued_ability_id: item.imbued_ability_id ?? 0,
      })),
      stats: (player.stats ?? []).map(toTrackerStat),
      personaname: undefined,
    })),
  };
}

/** The `objectives` and `mid_boss` JSON scalars; teams are `Team0`/`Team1` strings here. */
interface GraphqlObjective {
  team?: string | null;
  team_objective?: string | null;
  destroyed_time_s?: number | null;
}

interface GraphqlMidBoss {
  team_claimed?: string | null;
  destroyed_time_s?: number | null;
}

/** Resolves to null instead of failing when GraphQL is rate limited, so the caller can fall back to REST. */
async function unlessRateLimited<T>(query: Promise<T>): Promise<T | null> {
  try {
    return await query;
  } catch (error) {
    if (isGraphqlRateLimited(error)) return null;
    throw error;
  }
}

export function trackerMatchMetadataQueryOptions(matchId: number) {
  return queryOptions({
    queryKey: queryKeys.players.matchMetadata(matchId),
    queryFn: async (): Promise<TrackerMatchMetadata | null> => {
      const result = await unlessRateLimited(
        graphql.query({
          matches: {
            __args: { where: { match_id: { eq: matchId } }, limit: 1 },
            winning_team: true,
            average_badge_team_0: true,
            average_badge_team_1: true,
            objectives: true,
            mid_boss: true,
            players: {
              account_id: true,
              team: true,
              hero_id: true,
              assigned_lane: true,
              kills: true,
              deaths: true,
              assists: true,
              net_worth: true,
              player_level: true,
              last_hits: true,
              denies: true,
              max_player_damage: true,
              max_player_damage_taken: true,
              max_boss_damage: true,
              mvp_rank: true,
              player_rank_initial_display_rank: true,
              player_rank_initial_flat_progress: true,
              player_rank_final_flat_progress: true,
              player_rank_consumed_demotion_protection: true,
              ability_stats: true,
              items: { item_id: true, game_time_s: true, sold_time_s: true, upgrade_id: true, imbued_ability_id: true },
              stats: {
                time_stamp_s: true,
                net_worth: true,
                player_healing: true,
                kills: true,
                deaths: true,
                assists: true,
                creep_kills: true,
                denies: true,
                player_damage: true,
              },
              steam: { personaname: true },
              player_slot: true,
              death_details: true,
            },
          },
        }),
      );
      const match = result?.matches[0];
      if (!match) return fetchTrackerMatchMetadataFromRest(matchId);
      return {
        winning_team: match.winning_team,
        average_badge_team0: match.average_badge_team_0,
        average_badge_team1: match.average_badge_team_1,
        objectives: destroyedObjectives(match.objectives as GraphqlObjective[] | null, (objective) => ({
          team: objective.team ?? "",
          kind: graphqlObjectiveKind(objective.team_objective ?? ""),
        })),
        mid_boss: claimedMidBosses(match.mid_boss as GraphqlMidBoss[] | null, (boss) => boss.team_claimed ?? ""),
        deaths: (match.players ?? []).map(playerDeaths),
        players: (match.players ?? []).map((player) => ({
          account_id: player.account_id ?? 0,
          team: player.team ?? "",
          hero_id: player.hero_id ?? 0,
          assigned_lane: player.assigned_lane ?? 0,
          kills: player.kills ?? 0,
          deaths: player.deaths ?? 0,
          assists: player.assists ?? 0,
          net_worth: player.net_worth ?? 0,
          level: player.player_level ?? 0,
          last_hits: player.last_hits ?? 0,
          denies: player.denies ?? 0,
          player_damage: player.max_player_damage ?? 0,
          player_damage_taken: player.max_player_damage_taken ?? 0,
          boss_damage: player.max_boss_damage ?? 0,
          player_healing: maxStat(player.stats ?? undefined, "player_healing"),
          mvp_rank: player.mvp_rank ?? null,
          rank_badge: player.player_rank_initial_display_rank || null,
          rank_delta: rankDelta(player.player_rank_initial_flat_progress, player.player_rank_final_flat_progress),
          demotion_protected: player.player_rank_consumed_demotion_protection === true,
          // The GraphQL scalar maps ability ids to stacks, where the REST payload lists them as pairs.
          ability_stacks: Object.fromEntries(
            Object.entries((player.ability_stats as Record<string, number> | null) ?? {}).map(([id, value]) => [
              Number(id),
              value,
            ]),
          ),
          items: (player.items ?? []).map((item) => ({
            item_id: item.item_id ?? 0,
            game_time_s: item.game_time_s ?? 0,
            sold_time_s: item.sold_time_s ?? 0,
            upgrade_id: item.upgrade_id ?? 0,
            imbued_ability_id: item.imbued_ability_id ?? 0,
          })),
          stats: (player.stats ?? []).map(toTrackerStat),
          personaname: player.steam?.personaname,
        })),
      };
    },
    staleTime: CACHE_DURATIONS.FOREVER,
  });
}

export interface TrackerAbility {
  id: number;
  name: string;
  class_name: string;
  image: string | null;
  image_webp: string | null;
}

/**
 * Every hero ability with just what the scoreboard draws, from the GraphQL asset catalog; the REST ability list
 * carries each ability's full description and properties.
 */
export const trackerAbilitiesQueryOptions = queryOptions({
  queryKey: queryKeys.players.abilities(),
  queryFn: async (): Promise<TrackerAbility[]> => {
    const { items } = await graphql.query({
      items: {
        on_Ability: { id: true, name: true, class_name: true, image: true, image_webp: true },
      },
    });
    // Only the ability variant is selected, so every other item comes back null, whatever the generated type says.
    return items.flatMap((item: (typeof items)[number] | null) =>
      item && "class_name" in item
        ? [
            {
              id: item.id,
              name: item.name,
              class_name: item.class_name,
              image: item.image,
              image_webp: item.image_webp,
            },
          ]
        : [],
    );
  },
  staleTime: CACHE_DURATIONS.FOREVER,
});
