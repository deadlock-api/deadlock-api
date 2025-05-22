export interface APIMatchMetadata {
  average_badge_team0: number | null;
  average_badge_team1: number | null;
  duration_s: number;
  game_mode: string;
  game_mode_version: string | null;
  is_high_skill_range_parties: boolean | null;
  low_pri_pool: boolean | null;
  match_id: number;
  match_mode: string;
  match_outcome: string;
  new_player_pool: boolean | null;
  players: APIMatchPlayer[];
  start_time: string;
  winning_team: string;
}

export interface APIMatchPlayer {
  abandon_match_time_s: number;
  ability_points: number;
  account_id: number;
  assigned_lane: number;
  assists: number;
  deaths: number;
  denies: number;
  hero_id: number;
  items: APIMatchPlayerItem[];
  kills: number;
  last_hits: number;
  net_worth: number;
  party: number;
  player_level: number;
  player_slot: number;
  team: string;
}

export interface APIMatchPlayerItem {
  flags: number;
  game_time_s: number;
  imbued_ability_id: number;
  item_id: number;
  sold_time_s: number;
  upgrade_id: number;
}
