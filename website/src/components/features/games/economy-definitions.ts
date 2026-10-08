import type { AnalyticsGameStats, PlayerPerformanceCurvePoint } from "deadlock_api_client";

import { CHART_COLOR, SERIES_COLORS } from "~/components/patterns/charts/theme";
import type { Color } from "~/types/general";

/** A soul source as the game stats report it (`avg_gold_boss`); the performance curve reports it as `gold_boss_avg`. */
type StatKey = Extract<keyof AnalyticsGameStats, `avg_gold_${string}`>;
type CurveKey<K extends StatKey> = K extends `avg_${infer Field}` ? `${Field}_avg` : never;

function curveKey<K extends StatKey>(key: K): CurveKey<K> {
  return `${key.slice("avg_".length)}_avg` as CurveKey<K>;
}

export interface SoulSourceGroup {
  key: string;
  label: string;
  /** Distinct from its neighbours in the stacked charts. */
  color: Color;
  /** Souls confirmed directly (last-hit / secured without an orb drop). */
  baseKey: StatKey;
  /** Further sources summed into this group, for groups that bundle several small ones. */
  extraKeys?: StatKey[];
  /** Souls picked up from the secured soul orb, if the source drops one. */
  orbKey?: StatKey;
  /** Souls the API counts inside `baseKey` that another group shows on its own. */
  minusKey?: StatKey;
}

export const SOUL_SOURCE_GROUPS: SoulSourceGroup[] = [
  {
    key: "hero_kills",
    label: "Hero Kills",
    color: SERIES_COLORS[0],
    baseKey: "avg_gold_player",
    orbKey: "avg_gold_player_orbs",
    // The API's hero kill souls include assist souls, shown as their own source.
    minusKey: "avg_gold_assists",
  },
  {
    key: "assists",
    label: "Assists",
    color: SERIES_COLORS[5],
    baseKey: "avg_gold_assists",
  },
  {
    key: "lane_creeps",
    label: "Lane Creeps",
    color: SERIES_COLORS[1],
    baseKey: "avg_gold_lane_creep",
    orbKey: "avg_gold_lane_creep_orbs",
  },
  {
    key: "jungle",
    label: "Neutrals (Jungle)",
    color: SERIES_COLORS[2],
    baseKey: "avg_gold_neutral_creep",
    orbKey: "avg_gold_neutral_creep_orbs",
  },
  {
    key: "objectives",
    label: "Objectives",
    color: SERIES_COLORS[3],
    baseKey: "avg_gold_boss",
    orbKey: "avg_gold_boss_orb",
  },
  {
    key: "urn",
    label: "Urn",
    color: SERIES_COLORS[4],
    baseKey: "avg_gold_treasure",
  },
  {
    key: "breakables",
    label: "Breakables",
    color: SERIES_COLORS[7],
    baseKey: "avg_gold_breakable",
  },
  {
    // Income a player barely steers: neutral, so the series hues stay with the sources they farm.
    key: "team_bonus_items",
    label: "Team Bonus & Items",
    color: CHART_COLOR.neutral,
    baseKey: "avg_gold_team_bonus",
    extraKeys: [
      "avg_gold_item_trophy_collector",
      "avg_gold_item_cultist_sacrifice",
      "avg_gold_item_goose_egg",
      "avg_gold_ability_assassinate",
    ],
  },
];

function soulParts(read: (key: StatKey) => number, group: SoulSourceGroup): { base: number; orb: number } {
  const minus = group.minusKey ? read(group.minusKey) : 0;
  const extra = (group.extraKeys ?? []).reduce((sum, key) => sum + read(key), 0);
  return {
    base: Math.max(0, read(group.baseKey) + extra - minus),
    orb: group.orbKey ? read(group.orbKey) : 0,
  };
}

/** A group's souls, split into what was confirmed directly and what came from its orb. */
export function groupSoulParts(stats: AnalyticsGameStats, group: SoulSourceGroup): { base: number; orb: number } {
  return soulParts((key) => stats[key] ?? 0, group);
}

export function groupSouls(stats: AnalyticsGameStats, group: SoulSourceGroup): number {
  const { base, orb } = groupSoulParts(stats, group);
  return base + orb;
}

/** A group's souls at one point of the performance curve, split the same way as the game stats. */
export function curveGroupSouls(point: PlayerPerformanceCurvePoint, group: SoulSourceGroup): number {
  const { base, orb } = soulParts((key) => point[curveKey(key)] ?? 0, group);
  return base + orb;
}

/** Souls as a whole number; null for a missing reading, which the caller shows as `NoValue`. */
export function formatSouls(value: number | null | undefined): string | null {
  if (value == null || Number.isNaN(value)) return null;
  return Math.round(value).toLocaleString("en-US");
}

export function formatSoulsCompact(value: number): string {
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)}k`;
  return Math.round(value).toString();
}
