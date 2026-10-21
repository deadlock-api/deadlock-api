import { type QueryClient, queryOptions } from "@tanstack/react-query";
import type {
  PlayersApiEnemyStatsRequest,
  PlayersApiMateStatsRequest,
  PlayersApiPlayerHeroStatsRequest,
} from "deadlock_api_client";

import { CACHE_DURATIONS } from "~/constants/cache";
import { api } from "~/lib/api";
import type { GameMode, MatchMode } from "~/lib/game-mode";
import { graphql, isGraphqlRateLimited } from "~/lib/graphql";
import { ensureCached } from "~/lib/prefetch-safe";
import { combatStats, type CombatStats } from "~/lib/tracker/combat-stats";
import { DEMO_ACCOUNT_ID, isDemoAccount, isDemoMatch } from "~/lib/tracker/demo";
import {
  claimedMidBosses,
  destroyedObjectives,
  fetchRawMatchMetadata,
  type GraphqlMidBoss,
  type GraphqlObjective,
  graphqlObjectiveKind,
  maxStat,
  playerDeaths,
  rankDelta,
  toTrackerItem,
  toTrackerStat,
  trackerMatchFromRawMetadata,
} from "~/lib/tracker/match-metadata";
import { type LaneTimeline, laneStateOf, type TrackerMatchStats } from "~/lib/tracker/match-stats";

import { abilitiesQueryOptions, heroesQueryOptions, itemUpgradesQueryOptions } from "./asset-queries";
import { trackerMatchHistoryQueryOptions } from "./match-history-queries";
import { type MatchMetadataSource, queryKeys } from "./query-keys";

export { trackerMatchHistoryQueryOptions };

/** The demo profile is generated instead of fetched; the generator only loads once a demo id asks for it. */
const loadDemoData = () => import("~/lib/tracker/demo-data");

const demoHistory = (client: QueryClient) => ensureCached(client, trackerMatchHistoryQueryOptions(DEMO_ACCOUNT_ID));

/** Whether the ingest tool recently sent this account's matches, which opens its tracker without Patreon. */
export function trackerIngestStatusQueryOptions(accountId: number) {
  return queryOptions({
    queryKey: queryKeys.players.ingestStatus(accountId),
    queryFn: async () => (await api.internal_api.ingestStatus({ accountId })).data,
    staleTime: CACHE_DURATIONS.FIVE_MINUTES,
  });
}

export function trackerRankQueryOptions(accountId: number) {
  return queryOptions({
    queryKey: queryKeys.players.rank(accountId),
    queryFn: async ({ client }) => {
      if (isDemoAccount(accountId)) return (await loadDemoData()).demoRank(await demoHistory(client));
      const response = await api.players_api.rank({ accountId });
      return response.data;
    },
    staleTime: CACHE_DURATIONS.FIVE_MINUTES,
  });
}

export function trackerHeroStatsQueryOptions(params: PlayersApiPlayerHeroStatsRequest) {
  return queryOptions({
    queryKey: queryKeys.players.heroStats(params),
    queryFn: async ({ client }) => {
      if (params.accountIds.some(isDemoAccount)) {
        return (await loadDemoData()).demoHeroStats(await demoHistory(client), params);
      }
      const response = await api.players_api.playerHeroStats(params);
      return response.data;
    },
    staleTime: CACHE_DURATIONS.FIVE_MINUTES,
  });
}

export function trackerMateStatsQueryOptions(params: PlayersApiMateStatsRequest) {
  return queryOptions({
    queryKey: queryKeys.players.mateStats(params),
    queryFn: async ({ client }) => {
      if (isDemoAccount(params.accountId)) {
        return (await loadDemoData()).demoMateStats(await demoHistory(client), params);
      }
      const response = await api.players_api.mateStats(params);
      return response.data;
    },
    staleTime: CACHE_DURATIONS.FIVE_MINUTES,
  });
}

export function trackerEnemyStatsQueryOptions(params: PlayersApiEnemyStatsRequest) {
  return queryOptions({
    queryKey: queryKeys.players.enemyStats(params),
    queryFn: async ({ client }) => {
      if (isDemoAccount(params.accountId)) {
        return (await loadDemoData()).demoEnemyStats(await demoHistory(client), params);
      }
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
  /** Bit 1 (`ITEM_FLAG_BUILT_INTO_UPGRADE`): the item was built into an upgrade at `sold_time_s`, not sold. */
  flags: number;
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
  pregame_hero_id: number | null;
  combat_stats: CombatStats | null;
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

/** Resolves to null instead of failing when GraphQL is rate limited, so the caller can fall back to REST. */
async function unlessRateLimited<T>(query: Promise<T>): Promise<T | null> {
  try {
    return await query;
  } catch (error) {
    if (isGraphqlRateLimited(error)) return null;
    throw error;
  }
}

export interface TrackerMatchStatsParams {
  accountId: number;
  gameMode: GameMode;
  matchMode: MatchMode;
  heroId: number | null;
  minUnixTimestamp?: number | null;
  maxUnixTimestamp?: number | null;
}

/** The most recent matches the stat trends read: enough for every rolling window, light enough for a phone. */
export const MATCH_STATS_LIMIT = 500;
/** Two laners a side; the limit leaves room for a lane the game filled unevenly. */
const LANERS_PER_MATCH = 6;

/**
 * The tracked player's stored stats per match, latest first, each with how their lane stood at the laning phase end.
 * Only stored matches: what Steam has not sent us yet has no row.
 */
export function trackerMatchStatsQueryOptions(params: TrackerMatchStatsParams) {
  return queryOptions({
    queryKey: queryKeys.players.matchStats(params),
    queryFn: async ({ client }): Promise<TrackerMatchStats[]> => {
      const { accountId, gameMode, matchMode, heroId, minUnixTimestamp, maxUnixTimestamp } = params;
      if (isDemoAccount(accountId)) {
        const [{ demoMatchStats }, history, heroes] = await Promise.all([
          loadDemoData(),
          demoHistory(client),
          ensureCached(client, heroesQueryOptions),
        ]);
        return demoMatchStats(history, params, heroes, MATCH_STATS_LIMIT);
      }
      const { match_players: rows } = await graphql.query({
        match_players: {
          __args: {
            where: {
              account_id: { eq: accountId },
              game_mode: { eq: gameMode === "street_brawl" ? "StreetBrawl" : "Normal" },
              match_mode: { in: matchMode.split(",").map((mode) => (mode === "ranked" ? "Ranked" : "Unranked")) },
              ...(heroId == null ? {} : { hero_id: { eq: heroId } }),
              start_time: {
                ...(minUnixTimestamp == null ? {} : { gte: minUnixTimestamp }),
                ...(maxUnixTimestamp == null ? {} : { lte: maxUnixTimestamp }),
              },
            },
            order_by: "START_TIME",
            order_direction: "DESC",
            limit: MATCH_STATS_LIMIT,
          },
          match_id: true,
          duration_s: true,
          assigned_lane: true,
          max_player_damage: true,
          max_player_damage_taken: true,
          max_boss_damage: true,
          max_player_healing: true,
          max_shots_hit: true,
          max_shots_missed: true,
          max_hero_bullets_hit: true,
          max_hero_bullets_hit_crit: true,
          max_gold_neutral_creep: true,
          max_gold_death_loss: true,
        },
      });

      const matchesByLane = new Map<number, number[]>();
      for (const row of rows) {
        const lane = row.assigned_lane ?? 0;
        if (lane === 0 || row.match_id == null) continue;
        const ids = matchesByLane.get(lane);
        if (ids) ids.push(row.match_id);
        else matchesByLane.set(lane, [row.match_id]);
      }
      // One request per lane fetches only the players who shared it, a third of each match's timelines.
      const laners = new Map<number, LaneTimeline[]>();
      await Promise.all(
        [...matchesByLane].map(async ([lane, matchIds]) => {
          const { match_players: lanePlayers } = await graphql.query({
            match_players: {
              __args: {
                where: { match_id: { in: matchIds }, assigned_lane: { eq: lane } },
                limit: matchIds.length * LANERS_PER_MATCH,
              },
              match_id: true,
              account_id: true,
              team: true,
              hero_id: true,
              stats: {
                time_stamp_s: true,
                net_worth: true,
                kills: true,
                deaths: true,
                assists: true,
                creep_kills: true,
                denies: true,
                player_damage: true,
              },
            },
          });
          for (const player of lanePlayers) {
            if (player.match_id == null) continue;
            const timeline: LaneTimeline = {
              account_id: player.account_id ?? 0,
              team: player.team ?? "",
              hero_id: player.hero_id ?? 0,
              stats: (player.stats ?? []).map(toTrackerStat),
            };
            const list = laners.get(player.match_id);
            if (list) list.push(timeline);
            else laners.set(player.match_id, [timeline]);
          }
        }),
      );

      return rows.flatMap((row) =>
        row.match_id == null
          ? []
          : [
              {
                match_id: row.match_id,
                player_damage: row.max_player_damage ?? 0,
                player_damage_taken: row.max_player_damage_taken ?? 0,
                boss_damage: row.max_boss_damage ?? 0,
                healing: row.max_player_healing ?? 0,
                shots_hit: row.max_shots_hit ?? 0,
                shots_missed: row.max_shots_missed ?? 0,
                hero_bullets_hit: row.max_hero_bullets_hit ?? 0,
                hero_bullets_hit_crit: row.max_hero_bullets_hit_crit ?? 0,
                neutral_souls: row.max_gold_neutral_creep ?? 0,
                souls_lost: row.max_gold_death_loss ?? 0,
                lane: laneStateOf(
                  laners.get(row.match_id) ?? [],
                  accountId,
                  row.assigned_lane ?? 0,
                  row.duration_s ?? 0,
                ),
              },
            ],
      );
    },
    staleTime: CACHE_DURATIONS.FIVE_MINUTES,
  });
}

/** A stored match's headline facts, for its own page. */
export interface MatchSummary {
  match_id: number;
  start_time: number;
  duration_s: number;
  /** "Ranked", "Unranked", … as stored. */
  match_mode: string;
  /** "Normal", "StreetBrawl", … as stored. */
  game_mode: string;
  winning_team: string;
  average_badge_team0: number | null;
  average_badge_team1: number | null;
  /** Street Brawl's round score, Team0 first. */
  team_score: [number, number] | null;
  /** Street Brawl's rounds, each with its length. */
  round_durations_s: number[];
  players: MatchSummaryPlayer[];
}

/** One player's line of a stored match, as much as the match's header shows. */
export interface MatchSummaryPlayer {
  account_id: number;
  team: string;
  hero_id: number;
  player_level: number;
  kills: number;
  deaths: number;
  assists: number;
  net_worth: number;
  last_hits: number;
  denies: number;
  abandon_match_time_s: number | null;
  /** "Win", "Loss", "Penalized", "PenalizedParty", "NotScored". */
  player_match_outcome: string;
  rank_badge: number | null;
  rank_delta: number | null;
  demotion_protected: boolean;
  calibration: boolean;
}

/** A match's headline facts from what is stored, or null when we do not have the match. */
export function matchSummaryQueryOptions(matchId: number) {
  return queryOptions({
    queryKey: queryKeys.players.matchSummary(matchId),
    queryFn: async (): Promise<MatchSummary | null> => {
      const result = await graphql.query({
        matches: {
          __args: { where: { match_id: { eq: matchId } }, limit: 1 },
          match_id: true,
          start_time: true,
          duration_s: true,
          match_mode: true,
          game_mode: true,
          winning_team: true,
          average_badge_team_0: true,
          average_badge_team_1: true,
          team_score: true,
          street_brawl_rounds: true,
          players: {
            account_id: true,
            team: true,
            hero_id: true,
            player_level: true,
            kills: true,
            deaths: true,
            assists: true,
            net_worth: true,
            last_hits: true,
            denies: true,
            abandon_match_time_s: true,
            player_match_outcome: true,
            player_rank_initial_display_rank: true,
            player_rank_initial_flat_progress: true,
            player_rank_final_flat_progress: true,
            player_rank_consumed_demotion_protection: true,
            player_rank_initial_calibration_games: true,
          },
        },
      });
      const match = result.matches[0];
      if (!match) return null;
      const score = Array.isArray(match.team_score) ? (match.team_score as number[]) : null;
      const rounds = Array.isArray(match.street_brawl_rounds)
        ? (match.street_brawl_rounds as { round_duration_s?: number }[])
        : [];
      return {
        match_id: match.match_id ?? matchId,
        start_time: match.start_time ?? 0,
        duration_s: match.duration_s ?? 0,
        match_mode: match.match_mode ?? "",
        game_mode: match.game_mode ?? "",
        winning_team: match.winning_team ?? "",
        average_badge_team0: match.average_badge_team_0 || null,
        average_badge_team1: match.average_badge_team_1 || null,
        team_score: score && score.length === 2 ? [score[0], score[1]] : null,
        round_durations_s: rounds.map((round) => round.round_duration_s ?? 0).filter((duration) => duration > 0),
        players: (match.players ?? []).map((player) => ({
          account_id: player.account_id ?? 0,
          team: player.team ?? "",
          hero_id: player.hero_id ?? 0,
          player_level: player.player_level ?? 0,
          kills: player.kills ?? 0,
          deaths: player.deaths ?? 0,
          assists: player.assists ?? 0,
          net_worth: player.net_worth ?? 0,
          last_hits: player.last_hits ?? 0,
          denies: player.denies ?? 0,
          abandon_match_time_s: player.abandon_match_time_s || null,
          player_match_outcome: player.player_match_outcome ?? "",
          rank_badge: player.player_rank_initial_display_rank || null,
          rank_delta: rankDelta(player.player_rank_initial_flat_progress, player.player_rank_final_flat_progress),
          demotion_protected: player.player_rank_consumed_demotion_protection === true,
          calibration: (player.player_rank_initial_calibration_games ?? 0) > 0,
        })),
      };
    },
    // A stored match never changes; a missing one may be sent in any time.
    staleTime: (query) => (query.state.data === null ? CACHE_DURATIONS.FIVE_MINUTES : CACHE_DURATIONS.FOREVER),
  });
}

/**
 * One match's details. `graphql` reads only what is stored: the REST fallback may fetch a match from Steam, which a
 * page that only shows stored matches must not trigger.
 */
export function trackerMatchMetadataQueryOptions(matchId: number, source: MatchMetadataSource = "any") {
  return queryOptions({
    queryKey: queryKeys.players.matchMetadata(matchId, source),
    queryFn: async ({ client }): Promise<TrackerMatchMetadata | null> => {
      if (isDemoMatch(matchId)) {
        const [{ demoMatchMetadata }, history, heroes, items, abilities] = await Promise.all([
          loadDemoData(),
          demoHistory(client),
          ensureCached(client, heroesQueryOptions),
          ensureCached(client, itemUpgradesQueryOptions),
          ensureCached(client, trackerAbilitiesQueryOptions),
        ]);
        return demoMatchMetadata(matchId, history, { heroes, items, abilities });
      }
      const request = graphql.query({
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
            pregame_hero_id: true,
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
            items: {
              item_id: true,
              game_time_s: true,
              sold_time_s: true,
              upgrade_id: true,
              imbued_ability_id: true,
              flags: true,
            },
            stats: {
              custom_user_stats: true,
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
      });
      // Only stored matches: a rate limit is an error to retry, not a missing match.
      const result = source === "graphql" ? await request : await unlessRateLimited(request);
      const match = result?.matches[0];
      // A match row may exist before its players arrive; keep that incomplete response retryable.
      if (!match?.players?.length) {
        return source === "graphql" ? null : trackerMatchFromRawMetadata(await fetchRawMatchMetadata(matchId));
      }
      return {
        winning_team: match.winning_team,
        average_badge_team0: match.average_badge_team_0,
        average_badge_team1: match.average_badge_team_1,
        objectives: destroyedObjectives(match.objectives as GraphqlObjective[] | null, (objective) => ({
          team: objective.team ?? "",
          kind: graphqlObjectiveKind(objective.team_objective ?? ""),
        })),
        mid_boss: claimedMidBosses(match.mid_boss as GraphqlMidBoss[] | null, (boss) => boss.team_claimed ?? ""),
        deaths: match.players.map(playerDeaths),
        players: match.players.map((player) => ({
          account_id: player.account_id ?? 0,
          team: player.team ?? "",
          hero_id: player.hero_id ?? 0,
          pregame_hero_id: player.pregame_hero_id || null,
          combat_stats: combatStats(player.stats),
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
          items: (player.items ?? []).map(toTrackerItem),
          stats: (player.stats ?? []).map(toTrackerStat),
          personaname: player.steam?.personaname,
        })),
      };
    },
    // Collected metadata is immutable, but an empty response can become available after ingestion.
    staleTime: (query) => (query.state.data === null ? CACHE_DURATIONS.FIVE_MINUTES : CACHE_DURATIONS.FOREVER),
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
 * carries each ability's full description and properties, and serves as a fallback when GraphQL is rate limited.
 */
export const trackerAbilitiesQueryOptions = queryOptions({
  queryKey: queryKeys.players.abilities(),
  queryFn: async ({ client }): Promise<TrackerAbility[]> => {
    const result = await unlessRateLimited(
      graphql.query({
        items: {
          on_Ability: { id: true, name: true, class_name: true, image: true, image_webp: true },
        },
      }),
    );
    const items = result?.items ?? (await ensureCached(client, abilitiesQueryOptions));
    // Only the ability variant is selected, so every other item comes back null, whatever the generated type says.
    return items.flatMap((item: (typeof items)[number] | null) =>
      item && "class_name" in item
        ? [
            {
              id: item.id,
              name: item.name,
              class_name: item.class_name,
              image: item.image ?? null,
              image_webp: item.image_webp ?? null,
            },
          ]
        : [],
    );
  },
  staleTime: CACHE_DURATIONS.FOREVER,
});
