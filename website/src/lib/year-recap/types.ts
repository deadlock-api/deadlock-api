// The JSON of `GET /v1/players/{account_id}/year-recap?year=`, an internal endpoint not yet in the generated client.
// Field for field as the API sends it (api/src/routes/v1/players/year_recap.rs).

export type RecapGameMode = "normal" | "street_brawl";
export type RecapMatchMode = "ranked" | "unranked";

/** One match of the year, oldest first. */
export interface RecapMatch {
  match_id: number;
  start_time: number;
  duration_s: number;
  game_mode: RecapGameMode;
  match_mode: RecapMatchMode;
  hero_id: number;
  won: boolean;
}

export interface RecapTotals {
  matches: number;
  wins: number;
  /** Matches with per-match details (team, lane, healing, kill types, killers, items, souls by source). */
  detailed_matches: number;
  /** Matches with damage-matrix sums (damage sources and targets, `dm_*`, `cc_*`, `heal_prevented`). */
  damage_matrix_matches: number;
  seconds_played: number;
  kills: number;
  deaths: number;
  assists: number;
  /** Net worth at the end of every match, summed. */
  souls: number;
  last_hits: number;
  denies: number;
  player_damage: number;
  damage_taken: number;
  damage_mitigated: number;
  boss_damage: number;
  shots_hit: number;
  shots_missed: number;
  hero_bullets_hit: number;
  hero_bullets_crit: number;
  /** Matches by MVP rank: index 0 is the MVP, 1 second, 2 third. */
  mvp_rank_counts: number[];
  /** Matches since Valve reports MVP ranks: the denominator of `mvp_rank_counts`. */
  mvp_rated_matches: number;
  permanent_buffs: number;
  permanent_buff_matches: number;
  player_healing: number;
  teammate_healing: number;
  teammate_barriering: number;
  headshot_kills: number;
  bullet_kills: number;
  melee_kills: number;
  ability_kills: number;
  time_dead_s: number;
  non_hero_deaths: number;
  abandons: number;
  parries: number;
  parry_misses: number;
  unspent_gold_minutes: number;
  breakables_broken: number;
  comeback_gold: number;
  gold_players: number;
  gold_lane_creeps: number;
  gold_neutrals: number;
  gold_bosses: number;
  gold_treasure: number;
  gold_breakables: number;
  gold_death_loss: number;
  dm_bullet: number;
  dm_ability: number;
  dm_melee: number;
  cc_ms: number;
  cc_stun_ms: number;
  heal_prevented: number;
}

export interface RecapMatchModeCount {
  match_mode: RecapMatchMode;
  matches: number;
  wins: number;
  seconds: number;
}

export interface RecapHero {
  hero_id: number;
  matches: number;
  wins: number;
  seconds: number;
  kills: number;
  deaths: number;
  assists: number;
  player_damage: number;
  souls: number;
  first_played: number;
  last_played: number;
}

/** 0 is The Hidden King, 1 The Archmother. */
export interface RecapTeamCount {
  team: number;
  matches: number;
  wins: number;
}

/** `assigned_lane`: 1, 4 or 6 (`LANES`). */
export interface RecapLaneCount {
  lane: number;
  matches: number;
  wins: number;
}

export type RecapRecordStat =
  | "kills"
  | "assists"
  | "deaths"
  | "player_damage"
  | "damage_taken"
  | "damage_mitigated"
  | "player_healing"
  | "teammate_healing"
  | "souls"
  | "last_hits"
  | "denies"
  | "boss_damage"
  | "headshot_kills"
  | "parries"
  | "time_dead_s"
  | "cc_ms"
  | "longest_match_s"
  | "shortest_win_s";

export interface RecapRecord {
  stat: RecapRecordStat;
  value: number;
  match_id: number;
  start_time: number;
  hero_id: number;
  won: boolean;
}

export interface RecapStreak {
  length: number;
  from: number;
  to: number;
}

export interface RecapStreaks {
  longest_win: RecapStreak;
  longest_loss: RecapStreak;
}

export interface RecapItem {
  item_id: number;
  matches: number;
  wins: number;
}

/** `source`: an ability, item or weapon class name; a `_crit` suffix is the crit part of a weapon's damage. */
export interface RecapDamageSource {
  source: string;
  damage: number;
  matches: number;
}

export interface RecapHeroDamage {
  hero_id: number;
  damage: number;
  matches: number;
}

export interface RecapKiller {
  hero_id: number;
  deaths: number;
}

export interface RecapEnemy {
  hero_id: number;
  matches: number;
  wins: number;
}

export interface RecapAccolade {
  accolade_id: number;
  matches: number;
}

export interface RecapRankPoint {
  start_time: number;
  /** tier * 10 + subrank */
  badge: number;
}

export interface RecapRank {
  ranked_matches: number;
  first_badge: number;
  last_badge: number;
  peak_badge: number;
  peak_at: number;
  points: RecapRankPoint[];
}

export interface ModeRecap {
  game_mode: RecapGameMode;
  totals: RecapTotals;
  by_match_mode: RecapMatchModeCount[];
  /** Most played first. */
  heroes: RecapHero[];
  teams: RecapTeamCount[];
  lanes: RecapLaneCount[];
  records: RecapRecord[];
  streaks: RecapStreaks;
  /** Most bought first, at most 40. */
  items: RecapItem[];
  /** Most damage first, at most 20. */
  damage_sources: RecapDamageSource[];
  damage_targets: RecapHeroDamage[];
  killers: RecapKiller[];
  enemies: RecapEnemy[];
  accolades: RecapAccolade[];
  /** Only in `normal`; null without ranked matches. */
  rank: RecapRank | null;
}

export interface YearRecap {
  account_id: number;
  year: number;
  start_unix: number;
  /** Exclusive: the next Jan 1, 00:00 UTC. */
  end_unix: number;
  /** Ranked and Unranked matches of the year, oldest first. */
  matches: RecapMatch[];
  /** `normal` first, then `street_brawl`; a mode without matches is left out. */
  modes: ModeRecap[];
}
