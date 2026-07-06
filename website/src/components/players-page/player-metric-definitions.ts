export type PlayerMetricFormat = "integer" | "decimal1" | "decimal2" | "percent";

export type PlayerMetricCategory = "Combat" | "Farming" | "Economy" | "Damage" | "Healing";

export interface PlayerMetricDefinition {
  key: string;
  label: string;
  format: PlayerMetricFormat;
  category: PlayerMetricCategory;
}

export const PLAYER_METRIC_CATEGORIES: PlayerMetricCategory[] = ["Combat", "Farming", "Economy", "Damage", "Healing"];

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

export function formatPlayerMetricValue(value: number | undefined | null, format: PlayerMetricFormat): string {
  if (value == null || Number.isNaN(value)) return "-";
  switch (format) {
    case "integer":
      return Math.round(value).toLocaleString();
    case "decimal1":
      return value.toFixed(1);
    case "decimal2":
      return value.toFixed(2);
    case "percent":
      return `${(value * 100).toFixed(1)}%`;
  }
}
