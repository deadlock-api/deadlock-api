import type { AnalyticsGameStats } from "deadlock_api_client";

export type StatFormat = "integer" | "duration" | "percent" | "decimal1" | "decimal2";

export interface StatDefinition {
  key: keyof AnalyticsGameStats;
  label: string;
  format: StatFormat;
}

export interface StatCategory {
  label: string;
  stats: StatDefinition[];
}

export const GAME_STAT_CATEGORIES: StatCategory[] = [
  {
    label: "Match Flow",
    stats: [
      { key: "total_matches", label: "Total Matches", format: "integer" },
      { key: "avg_duration_s", label: "Avg Duration", format: "duration" },
      { key: "abandon_rate", label: "Abandon Rate", format: "percent" },
      { key: "mid_boss_kill_rate", label: "Mid Boss Kill Rate", format: "percent" },
      { key: "avg_first_mid_boss_time_s", label: "Avg First Mid Boss", format: "duration" },
      { key: "avg_objectives_destroyed_time_s", label: "Avg Objectives Destroyed", format: "duration" },
    ],
  },
  {
    label: "Combat",
    stats: [
      { key: "avg_kills", label: "Avg Kills", format: "decimal1" },
      { key: "avg_deaths", label: "Avg Deaths", format: "decimal1" },
      { key: "avg_assists", label: "Avg Assists", format: "decimal1" },
      { key: "avg_kd_ratio", label: "Avg K/D Ratio", format: "decimal2" },
      { key: "avg_accuracy", label: "Avg Accuracy", format: "percent" },
      { key: "avg_crit_rate", label: "Avg Crit Rate", format: "percent" },
    ],
  },
  {
    label: "Damage",
    stats: [
      { key: "avg_player_damage", label: "Avg Player Damage", format: "integer" },
      { key: "avg_player_damage_taken", label: "Avg Damage Taken", format: "integer" },
      { key: "avg_boss_damage", label: "Avg Objective Damage", format: "integer" },
      { key: "avg_creep_damage", label: "Avg Creep Damage", format: "integer" },
      { key: "avg_neutral_damage", label: "Avg Neutral Damage", format: "integer" },
    ],
  },
  {
    label: "Healing & Mitigation",
    stats: [
      { key: "avg_player_healing", label: "Avg Healing", format: "integer" },
      { key: "avg_self_healing", label: "Avg Self Healing", format: "integer" },
      { key: "avg_damage_mitigated", label: "Avg Damage Mitigated", format: "integer" },
      { key: "avg_damage_absorbed", label: "Avg Damage Absorbed", format: "integer" },
      { key: "avg_heal_prevented", label: "Avg Heal Prevented", format: "integer" },
    ],
  },
  {
    label: "Farming",
    stats: [
      { key: "avg_last_hits", label: "Avg Last Hits", format: "decimal1" },
      { key: "avg_denies", label: "Avg Denies", format: "decimal1" },
      { key: "avg_creep_kills", label: "Avg Creep Kills", format: "decimal1" },
      { key: "avg_neutral_kills", label: "Avg Neutral Kills", format: "decimal1" },
      { key: "avg_possible_creeps", label: "Avg Possible Creeps", format: "decimal1" },
      { key: "avg_ending_level", label: "Avg Ending Level", format: "decimal1" },
    ],
  },
  {
    label: "Character Stats",
    stats: [
      { key: "avg_max_health", label: "Avg Max Health", format: "integer" },
      { key: "avg_weapon_power", label: "Avg Weapon Power", format: "integer" },
      { key: "avg_tech_power", label: "Avg Tech Power", format: "integer" },
    ],
  },
  {
    label: "Economy",
    stats: [
      { key: "avg_net_worth", label: "Avg Souls", format: "integer" },
      { key: "avg_gold_player", label: "Avg Souls (Players)", format: "integer" },
      { key: "avg_gold_lane_creep", label: "Avg Souls (Lane Creep)", format: "integer" },
      { key: "avg_gold_neutral_creep", label: "Avg Souls (Neutral Creep)", format: "integer" },
      { key: "avg_gold_boss", label: "Avg Souls (Objectives)", format: "integer" },
      { key: "avg_gold_treasure", label: "Avg Souls (Urn)", format: "integer" },
      { key: "avg_gold_denied", label: "Avg Souls (Denied)", format: "integer" },
      { key: "avg_gold_death_loss", label: "Avg Souls (Death Loss)", format: "integer" },
    ],
  },
];

const MID_BOSS_STATS = new Set(["mid_boss_kill_rate", "avg_first_mid_boss_time_s"]);

export function getFilteredCategories(isStreetBrawl: boolean): StatCategory[] {
  if (!isStreetBrawl) return GAME_STAT_CATEGORIES;
  return GAME_STAT_CATEGORIES.map((c) => ({
    ...c,
    stats: c.stats.filter((s) => !MID_BOSS_STATS.has(s.key)),
  })).filter((c) => c.stats.length > 0);
}

export const ALL_STAT_KEYS = GAME_STAT_CATEGORIES.flatMap((c) => c.stats.map((s) => s.key));

export function getStatDefinition(key: string): StatDefinition | undefined {
  for (const category of GAME_STAT_CATEGORIES) {
    const stat = category.stats.find((s) => s.key === key);
    if (stat) return stat;
  }
  return undefined;
}

export function formatStatValue(value: number | undefined | null, format: StatFormat): string {
  if (value == null || Number.isNaN(value)) return "-";
  switch (format) {
    case "integer":
      return Math.round(value).toLocaleString();
    case "duration": {
      const minutes = Math.floor(value / 60);
      const seconds = Math.round(value % 60);
      return `${minutes}:${seconds.toString().padStart(2, "0")}`;
    }
    case "percent":
      return `${(value * 100).toFixed(1)}%`;
    case "decimal1":
      return value.toFixed(1);
    case "decimal2":
      return value.toFixed(2);
  }
}
