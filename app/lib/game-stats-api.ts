import { api } from "./api";
import { API_ORIGIN } from "./constants";

export interface AnalyticsGameStats {
  abandon_rate: number;
  avg_accuracy: number;
  avg_assists: number;
  avg_boss_damage: number;
  avg_crit_rate: number;
  avg_deaths: number;
  avg_denies: number;
  avg_duration_s: number;
  avg_ending_level: number;
  avg_first_mid_boss_time_s: number;
  avg_gold_boss: number;
  avg_gold_death_loss: number;
  avg_gold_denied: number;
  avg_gold_lane_creep: number;
  avg_gold_neutral_creep: number;
  avg_gold_player: number;
  avg_gold_treasure: number;
  avg_kd_ratio: number;
  avg_kills: number;
  avg_last_hits: number;
  avg_net_worth: number;
  avg_player_damage: number;
  avg_player_damage_taken: number;
  avg_player_healing: number;
  bucket: number;
  mid_boss_kill_rate: number;
  total_matches: number;
}

export type GameStatsBucket = "no_bucket" | "avg_badge" | "start_time_hour" | "start_time_day" | "start_time_week" | "start_time_month";

export interface GameStatsParams {
  bucket?: GameStatsBucket;
  game_mode?: string;
  min_unix_timestamp?: number;
  max_unix_timestamp?: number;
  min_duration_s?: number;
  max_duration_s?: number;
  min_average_badge?: number;
  max_average_badge?: number;
}

export async function fetchGameStats(params: GameStatsParams): Promise<AnalyticsGameStats[]> {
  const response = await api.client.get<AnalyticsGameStats[]>(`${API_ORIGIN}/v1/analytics/game-stats`, { params });
  return response.data;
}
