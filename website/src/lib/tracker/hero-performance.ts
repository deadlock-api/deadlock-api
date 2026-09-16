import type { HeroStats } from "deadlock_api_client";

import type { FormResult, SortDir } from "./compute";

export interface HeroRow {
  heroId: number;
  matches: number;
  winrate: number;
  kda: number;
  kills: number;
  deaths: number;
  assists: number;
  soulsPerMin: number;
  dmgPerMin: number;
  lastHitsPerMin: number;
  /** Win rate over the available recent history, or null when no recent results are available. */
  recentWinrate: number | null;
  lastPlayed: number;
}

export function toHeroRow(stats: HeroStats, form: FormResult[] | undefined): HeroRow {
  const matches = stats.matches_played;
  return {
    heroId: stats.hero_id,
    matches,
    winrate: matches > 0 ? stats.wins / matches : 0,
    kda: stats.deaths > 0 ? (stats.kills + stats.assists) / stats.deaths : stats.kills + stats.assists,
    kills: matches > 0 ? stats.kills / matches : 0,
    deaths: matches > 0 ? stats.deaths / matches : 0,
    assists: matches > 0 ? stats.assists / matches : 0,
    soulsPerMin: stats.networth_per_min,
    dmgPerMin: stats.damage_per_min,
    lastHitsPerMin: stats.last_hits_per_min,
    recentWinrate: form?.length ? form.filter((result) => result === "win").length / form.length : null,
    lastPlayed: stats.last_played,
  };
}

export type HeroSortKey = keyof Omit<HeroRow, "heroId">;

/** Keep missing results last in either direction and preserve deterministic ties. */
export function sortHeroRows(rows: HeroRow[], key: HeroSortKey, direction: SortDir): HeroRow[] {
  return [...rows].sort((a, b) => {
    const left = a[key];
    const right = b[key];
    if (left == null && right != null) return 1;
    if (right == null && left != null) return -1;
    const difference = left == null || right == null ? 0 : left - right;
    return (direction === "asc" ? difference : -difference) || b.matches - a.matches || a.heroId - b.heroId;
  });
}
