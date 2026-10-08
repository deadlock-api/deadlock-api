import { api } from "~/lib/api";
import { combatStats, resolveCustomStats } from "~/lib/tracker/combat-stats";
import type {
  TrackerMatchDeath,
  TrackerMatchItem,
  TrackerMatchMetadata,
  TrackerMatchStat,
  TrackerMidBoss,
  TrackerObjective,
  TrackerObjectiveKind,
  TrackerPlayerDeaths,
} from "~/queries/tracker-queries";

/** The REST metadata of one match; the tracker and the team builder's match import both read it. */
export async function fetchRawMatchMetadata(matchId: number): Promise<RawMatchMetadata> {
  const response = await api.matches_api.metadata({ matchId });
  // The SDK declares no body for this endpoint (`void`); the API serves the protobuf JSON.
  return response.data as unknown as RawMatchMetadata;
}

/**
 * Shape of the protobuf-JSON `/v1/matches/{id}/metadata` response, as far as the site reads it (the SDK has no type
 * for it). Teams are `ECitadelLobbyTeam` numbers (0/1).
 */
export interface RawMatchMetadata {
  pregame_hero_ids?: Record<string, number>;
  match_info?: {
    /** `ECitadelGameMode`: Normal 1, StreetBrawl 4. */
    game_mode?: number;
    custom_user_stats?: { id?: number; name?: string }[];
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
        custom_user_stats?: { id?: number; value?: number }[];
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

export function playerDeaths(player: {
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
export function maxStat<K extends string>(stats: Partial<Record<K, number | null>>[] | undefined, key: K): number {
  let max = 0;
  for (const stat of stats ?? []) max = Math.max(max, stat[key] ?? 0);
  return max;
}

export function toTrackerStat(stat: { [key in keyof TrackerMatchStat]?: number | null }): TrackerMatchStat {
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

export function toTrackerItem(item: { [key in keyof TrackerMatchItem]?: number | null }): TrackerMatchItem {
  return {
    item_id: item.item_id ?? 0,
    game_time_s: item.game_time_s ?? 0,
    sold_time_s: item.sold_time_s ?? 0,
    upgrade_id: item.upgrade_id ?? 0,
    imbued_ability_id: item.imbued_ability_id ?? 0,
  };
}

/** The progress a match applied, which demotion protection can hold at zero against the change the result asked for. */
export function rankDelta(initial: number | null | undefined, final: number | null | undefined): number | null {
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
export function graphqlObjectiveKind(name: string): TrackerObjectiveKind | undefined {
  if (name.startsWith("Tier1")) return "guardian";
  if (name.startsWith("Tier2")) return "walker";
  if (name.startsWith("BarrackBoss")) return "baseGuardian";
  if (name.startsWith("TitanShieldGenerator")) return "shrine";
  if (name === "Titan") return "patron";
  if (name === "Core") return "patronCore";
  return undefined;
}

export function destroyedObjectives<T extends { destroyed_time_s?: number | null }>(
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

export function claimedMidBosses<T extends { destroyed_time_s?: number | null }>(
  raw: T[] | null | undefined,
  teamOf: (entry: T) => string,
): TrackerMidBoss[] {
  return (raw ?? [])
    .filter((entry) => entry.destroyed_time_s)
    .map((entry) => ({ team_claimed: teamOf(entry), destroyed_time_s: entry.destroyed_time_s as number }));
}

/**
 * A tracker match from the REST metadata, the fallback for matches the GraphQL (ClickHouse) side has not ingested
 * yet: the endpoint fetches them on demand from Valve's replay CDN. It has no Steam names; the component backfills
 * those via the Steam profile endpoint. `null` when the match has no players on record.
 */
export function trackerMatchFromRawMetadata(metadata: RawMatchMetadata): TrackerMatchMetadata | null {
  const info = metadata.match_info;
  if (!info?.players?.length) return null;
  const customStatNames = new Map(
    (info.custom_user_stats ?? []).flatMap((stat) =>
      stat.id != null && stat.name ? [[stat.id, stat.name] as const] : [],
    ),
  );
  return {
    winning_team: info.winning_team == null ? null : restTeam(info.winning_team),
    average_badge_team0: info.average_badge_team0,
    average_badge_team1: info.average_badge_team1,
    objectives: destroyedObjectives(info.objectives, (objective) => ({
      team: restTeam(objective.team),
      kind: REST_OBJECTIVE_KINDS[objective.team_objective_id ?? -1],
    })),
    mid_boss: claimedMidBosses(info.mid_boss, (boss) => restTeam(boss.team_claimed)),
    deaths: info.players.map(playerDeaths),
    players: info.players.map((player) => ({
      account_id: player.account_id ?? 0,
      team: restTeam(player.team),
      hero_id: player.hero_id ?? 0,
      pregame_hero_id: metadata.pregame_hero_ids?.[String(player.account_id)] || null,
      combat_stats: combatStats(
        (player.stats ?? []).map((stat) => ({
          time_stamp_s: stat.time_stamp_s,
          custom_user_stats: resolveCustomStats(stat.custom_user_stats, customStatNames),
        })),
      ),
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
      items: (player.items ?? []).map(toTrackerItem),
      stats: (player.stats ?? []).map(toTrackerStat),
      personaname: undefined,
    })),
  };
}

/** The `objectives` and `mid_boss` JSON scalars; teams are `Team0`/`Team1` strings here. */
export interface GraphqlObjective {
  team?: string | null;
  team_objective?: string | null;
  destroyed_time_s?: number | null;
}

export interface GraphqlMidBoss {
  team_claimed?: string | null;
  destroyed_time_s?: number | null;
}
