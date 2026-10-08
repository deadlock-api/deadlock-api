import type { AnalyticsGameStats } from "deadlock_api_client";
import { Activity, Coins, Flame, HeartPulse, type LucideIcon, Shield, Sparkles, Swords, Wheat } from "lucide-react";

import { BUFF_TIMINGS_SINCE } from "~/lib/buffs";
import type { StatFormat } from "~/lib/stat-format";

export { formatAxisTick, formatStatValue, type StatFormat, valueSpan } from "~/lib/stat-format";

export interface StatDefinition {
  key: keyof AnalyticsGameStats;
  label: string;
  format: StatFormat;
  /**
   * What a change means for the game: more players is good news, more abandons bad news. Most figures only describe
   * how games are played (an average of kills rises with the deaths it causes), so they default to neutral.
   */
  polarity?: "higher-is-better" | "lower-is-better" | "neutral";
  /**
   * Unix time the game started recording the stat. Earlier matches have no value (`null`), which is shown as missing
   * rather than as a zero.
   */
  recordedSince?: number;
}

export interface StatCategory {
  label: string;
  stats: StatDefinition[];
  /** A line under the category's title: what its numbers cover. */
  note?: string;
}

export const GAME_STAT_CATEGORIES: StatCategory[] = [
  {
    label: "Match Flow",
    stats: [
      { key: "total_matches", label: "Total Matches", format: "integer", polarity: "higher-is-better" },
      { key: "total_players", label: "Total Players", format: "integer", polarity: "higher-is-better" },
      { key: "avg_duration_s", label: "Avg Duration", format: "duration" },
      { key: "abandon_rate", label: "Abandon Rate", format: "percent", polarity: "lower-is-better" },
      { key: "mid_boss_kill_rate", label: "Mid Boss Kill Rate", format: "percent" },
      { key: "avg_first_mid_boss_time_s", label: "Avg First Mid Boss", format: "duration" },
      {
        key: "avg_first_objective_destroyed_time_s",
        label: "Avg First Objective Destroyed",
        format: "duration",
      },
    ],
  },
  {
    label: "Combat",
    stats: [
      { key: "avg_kills", label: "Avg Kills", format: "decimal1" },
      { key: "avg_deaths", label: "Avg Deaths", format: "decimal1" },
      { key: "avg_assists", label: "Avg Assists", format: "decimal1" },
      // The mean of every player's own K/D, which a few lopsided games pull well above kills / deaths.
      { key: "avg_kd_ratio", label: "Avg Player K/D", format: "decimal2" },
      { key: "avg_accuracy", label: "Avg Accuracy", format: "percent" },
      { key: "avg_crit_rate", label: "Avg Crit Rate", format: "percent" },
    ],
  },
  {
    label: "Damage",
    stats: [
      { key: "avg_player_damage", label: "Avg Player Damage", format: "integer" },
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
    label: "Permanent Buffs",
    note: "Pickup times since the September 29, 2026 update",
    stats: [
      { key: "avg_permanent_buffs", label: "Avg Buff Pickups", format: "decimal1" },
      { key: "avg_permanent_buffs_per_min", label: "Avg Buff Pickups / Min", format: "decimal2" },
      {
        key: "avg_first_permanent_buff_time_s",
        label: "Avg First Buff Pickup",
        format: "duration",
        recordedSince: BUFF_TIMINGS_SINCE,
      },
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
      { key: "avg_gold_player_orbs", label: "Avg Souls (Player Orbs)", format: "integer" },
      { key: "avg_gold_lane_creep", label: "Avg Souls (Lane Creep)", format: "integer" },
      { key: "avg_gold_lane_creep_orbs", label: "Avg Souls (Lane Creep Orbs)", format: "integer" },
      { key: "avg_gold_neutral_creep", label: "Avg Souls (Neutral Creep)", format: "integer" },
      { key: "avg_gold_neutral_creep_orbs", label: "Avg Souls (Neutral Creep Orbs)", format: "integer" },
      { key: "avg_gold_boss", label: "Avg Souls (Objectives)", format: "integer" },
      { key: "avg_gold_boss_orb", label: "Avg Souls (Objective Orbs)", format: "integer" },
      { key: "avg_gold_treasure", label: "Avg Souls (Urn)", format: "integer" },
      { key: "avg_gold_denied", label: "Avg Souls (Denied)", format: "integer" },
      { key: "avg_gold_death_loss", label: "Avg Souls (Death Loss)", format: "integer" },
      { key: "avg_gold_assists", label: "Avg Souls (Assists)", format: "integer" },
      { key: "avg_gold_breakable", label: "Avg Souls (Breakables)", format: "integer" },
      { key: "avg_gold_team_bonus", label: "Avg Souls (Team Bonus)", format: "integer" },
      { key: "avg_gold_item_trophy_collector", label: "Avg Souls (Trophy Collector)", format: "integer" },
      { key: "avg_gold_item_cultist_sacrifice", label: "Avg Souls (Cultist Sacrifice)", format: "integer" },
      { key: "avg_gold_item_goose_egg", label: "Avg Souls (Golden Goose Egg)", format: "integer" },
      { key: "avg_gold_ability_assassinate", label: "Avg Souls (Assassinate)", format: "integer" },
    ],
  },
];

export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  "Match Flow": Activity,
  Combat: Swords,
  Damage: Flame,
  "Healing & Mitigation": HeartPulse,
  Farming: Wheat,
  "Permanent Buffs": Sparkles,
  "Character Stats": Shield,
  Economy: Coins,
};

const MID_BOSS_STATS = new Set(["mid_boss_kill_rate", "avg_first_mid_boss_time_s"]);
const STREET_BRAWL_HIDDEN_CATEGORIES = new Set(["Economy"]);

export function getFilteredCategories(isStreetBrawl: boolean): StatCategory[] {
  if (!isStreetBrawl) return GAME_STAT_CATEGORIES;
  return GAME_STAT_CATEGORIES.filter((c) => !STREET_BRAWL_HIDDEN_CATEGORIES.has(c.label))
    .map((c) => {
      const stats = c.stats.filter((s) => !MID_BOSS_STATS.has(s.key));
      return { label: c.label, stats };
    })
    .filter((c) => c.stats.length > 0);
}

export type GameStatKey = StatDefinition["key"];

export const ALL_STAT_KEYS: readonly GameStatKey[] = GAME_STAT_CATEGORIES.flatMap((c) => c.stats.map((s) => s.key));

const STAT_KEYS = new Set<string>(ALL_STAT_KEYS);

/** Whether `value` names a game stat: the charts' selectors hand back plain strings. */
export function isGameStatKey(value: string): value is GameStatKey {
  return STAT_KEYS.has(value);
}

export function getStatDefinition(key: string): StatDefinition | undefined {
  for (const category of GAME_STAT_CATEGORIES) {
    const stat = category.stats.find((s) => s.key === key);
    if (stat) return stat;
  }
  return undefined;
}
