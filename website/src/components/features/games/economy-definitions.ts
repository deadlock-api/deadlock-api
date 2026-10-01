import type { AnalyticsGameStats } from "deadlock_api_client";

import { CHART_COLOR, SERIES_COLORS } from "~/components/patterns/charts/theme";
import type { Color } from "~/types/general";

type StatKey = keyof AnalyticsGameStats;

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

/** A group's souls, split into what was confirmed directly and what came from its orb. */
export function groupSoulParts(stats: AnalyticsGameStats, group: SoulSourceGroup): { base: number; orb: number } {
  const minus = group.minusKey ? (stats[group.minusKey] ?? 0) : 0;
  const extra = (group.extraKeys ?? []).reduce((sum, key) => sum + (stats[key] ?? 0), 0);
  return {
    base: Math.max(0, (stats[group.baseKey] ?? 0) + extra - minus),
    orb: group.orbKey ? (stats[group.orbKey] ?? 0) : 0,
  };
}

export function groupSouls(stats: AnalyticsGameStats, group: SoulSourceGroup): number {
  const { base, orb } = groupSoulParts(stats, group);
  return base + orb;
}

export function formatSouls(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "-";
  return Math.round(value).toLocaleString("en-US");
}

export function formatSoulsCompact(value: number): string {
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)}k`;
  return Math.round(value).toString();
}

export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}
