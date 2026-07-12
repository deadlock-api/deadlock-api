import type { AnalyticsGameStats } from "deadlock_api_client";

type StatKey = keyof AnalyticsGameStats;

export interface SoulSourceGroup {
  key: string;
  label: string;
  color: string;
  /** Souls confirmed directly (last-hit / secured without an orb drop). */
  baseKey: StatKey;
  /** Souls picked up from the secured soul orb, if the source drops one. */
  orbKey?: StatKey;
}

export const SOUL_SOURCE_GROUPS: SoulSourceGroup[] = [
  {
    key: "hero_kills",
    label: "Hero Kills",
    color: "#f59e0b",
    baseKey: "avg_gold_player",
    orbKey: "avg_gold_player_orbs",
  },
  {
    key: "lane_creeps",
    label: "Lane Creeps",
    color: "#4ade80",
    baseKey: "avg_gold_lane_creep",
    orbKey: "avg_gold_lane_creep_orbs",
  },
  {
    key: "jungle",
    label: "Neutrals (Jungle)",
    color: "#2dd4bf",
    baseKey: "avg_gold_neutral_creep",
    orbKey: "avg_gold_neutral_creep_orbs",
  },
  {
    key: "objectives",
    label: "Objectives",
    color: "#a78bfa",
    baseKey: "avg_gold_boss",
    orbKey: "avg_gold_boss_orb",
  },
  {
    key: "urn",
    label: "Urn",
    color: "#fb7185",
    baseKey: "avg_gold_treasure",
  },
];

export function groupSouls(stats: AnalyticsGameStats, group: SoulSourceGroup): number {
  const base = (stats[group.baseKey] as number) ?? 0;
  const orb = group.orbKey ? ((stats[group.orbKey] as number) ?? 0) : 0;
  return base + orb;
}

export function formatSouls(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "-";
  return Math.round(value).toLocaleString();
}

export function formatSoulsCompact(value: number): string {
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)}k`;
  return Math.round(value).toString();
}

export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}
