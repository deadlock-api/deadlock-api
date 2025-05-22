// Basic match history entry from /v1/players/{account_id}/match-history
export interface APIMatchHistory {
  match_id: number;
  start_time: number;
  duration_s: number;
  winning_team: string;
  match_outcome: string;
  hero_id: number;
  kills: number;
  deaths: number;
  assists: number;
  net_worth?: number;
  player_level?: number;
  last_hits?: number;
  denies?: number;
  assigned_lane?: number;
  team: string;
  abandon_match_time_s?: number;
  party?: number;
  player_slot?: number;
  ability_points?: number;
}
