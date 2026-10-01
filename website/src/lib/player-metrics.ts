import { type GameMode, hasSoulEconomy } from "~/lib/game-mode";
import { formatStatValue, type StatFormat } from "~/lib/stat-format";

export type PlayerMetricFormat = StatFormat;

export type PlayerMetricCategory = "Combat" | "Farming" | "Economy" | "Damage" | "Healing" | "Permanent Buffs";

export interface PlayerMetricDefinition {
  key: string;
  label: string;
  format: PlayerMetricFormat;
  category: PlayerMetricCategory;
}

export const PLAYER_METRIC_CATEGORIES: PlayerMetricCategory[] = [
  "Combat",
  "Farming",
  "Economy",
  "Damage",
  "Healing",
  "Permanent Buffs",
];

export const PLAYER_METRICS: PlayerMetricDefinition[] = [
  { key: "kills", label: "Kills", format: "decimal1", category: "Combat" },
  { key: "deaths", label: "Deaths", format: "decimal1", category: "Combat" },
  { key: "assists", label: "Assists", format: "decimal1", category: "Combat" },
  { key: "kills_plus_assists", label: "Kills + Assists", format: "decimal1", category: "Combat" },
  { key: "kd", label: "K/D Ratio", format: "decimal2", category: "Combat" },
  { key: "kda", label: "KDA Ratio", format: "decimal2", category: "Combat" },
  { key: "accuracy", label: "Accuracy", format: "percent", category: "Combat" },
  { key: "crit_shot_rate", label: "Crit Shot Rate", format: "percent", category: "Combat" },
  { key: "last_hits", label: "Last Hits", format: "decimal1", category: "Farming" },
  { key: "denies", label: "Denies", format: "decimal1", category: "Farming" },
  { key: "net_worth", label: "Net Worth", format: "integer", category: "Economy" },
  { key: "net_worth_per_min", label: "Net Worth / Min", format: "integer", category: "Economy" },
  { key: "player_damage", label: "Player Damage", format: "integer", category: "Damage" },
  { key: "player_damage_per_min", label: "Player Damage / Min", format: "integer", category: "Damage" },
  { key: "player_damage_per_health", label: "Player Damage / Max Health", format: "decimal2", category: "Damage" },
  { key: "player_damage_taken_per_min", label: "Damage Taken / Min", format: "integer", category: "Damage" },
  { key: "neutral_damage", label: "Neutral Damage", format: "integer", category: "Damage" },
  { key: "neutral_damage_per_min", label: "Neutral Damage / Min", format: "integer", category: "Damage" },
  { key: "boss_damage", label: "Objective Damage", format: "integer", category: "Damage" },
  { key: "boss_damage_per_min", label: "Objective Damage / Min", format: "integer", category: "Damage" },
  { key: "self_healing", label: "Self Healing", format: "integer", category: "Healing" },
  { key: "self_healing_per_min", label: "Self Healing / Min", format: "integer", category: "Healing" },
  { key: "player_healing", label: "Player Healing", format: "integer", category: "Healing" },
  { key: "player_healing_per_min", label: "Player Healing / Min", format: "integer", category: "Healing" },
  { key: "healing", label: "Total Healing", format: "integer", category: "Healing" },
  { key: "healing_per_min", label: "Total Healing / Min", format: "integer", category: "Healing" },
  { key: "teammate_healing", label: "Teammate Healing", format: "integer", category: "Healing" },
  { key: "teammate_barriering", label: "Teammate Barriering", format: "integer", category: "Healing" },
  { key: "heal_prevented", label: "Heal Prevented", format: "integer", category: "Healing" },
];

/**
 * Golden statue pickups. The API returns them only with `include_buff_metrics`, which costs about twice as much on a
 * hero filter, so they stay out of `PLAYER_METRICS` and are fetched only where they are shown. The first pickup time
 * only covers matches since the City Never Sleeps update (`BUFF_TIMINGS_SINCE`); over older ranges it is `null`.
 */
export const PLAYER_BUFF_METRICS: PlayerMetricDefinition[] = [
  { key: "permanent_buffs", label: "Buff Pickups", format: "decimal1", category: "Permanent Buffs" },
  { key: "permanent_buffs_per_min", label: "Buff Pickups / Min", format: "decimal2", category: "Permanent Buffs" },
  { key: "first_permanent_buff_time_s", label: "First Buff Pickup", format: "duration", category: "Permanent Buffs" },
];

/** The metrics worth showing in a game mode: Street Brawl has no soul economy, so it leaves out the Economy ones. */
export function playerMetricsFor<T extends { category: PlayerMetricCategory }>(
  metrics: readonly T[],
  gameMode: GameMode | null | undefined,
): T[] {
  return hasSoulEconomy(gameMode) ? [...metrics] : metrics.filter((metric) => metric.category !== "Economy");
}

/** A player metric in its format; the same formats, and output, as every other stat on the site. */
export function formatPlayerMetricValue(value: number | undefined | null, format: PlayerMetricFormat): string {
  return formatStatValue(value, format);
}
