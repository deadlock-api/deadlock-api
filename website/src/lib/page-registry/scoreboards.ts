import { buildSortByValue, SORT_CATEGORIES, type ScoreboardStat, type SortVariant } from "~/lib/scoreboard-sorts";

import type { SortKey } from "./types";

// The hero and player scoreboards sort by the same stats; this maps the shared sort keys onto them, once for both.

/** The scoreboards' stats by the shared sort keys; a stat the scoreboards do not have fails to typecheck. */
const SCOREBOARD_STATS = {
  kills: "kills",
  deaths: "deaths",
  assists: "assists",
  souls: "net_worth",
  damage: "player_damage",
  damage_taken: "damage_taken",
  boss_damage: "boss_damage",
  creep_damage: "creep_damage",
  neutral_damage: "neutral_damage",
  last_hits: "last_hits",
  denies: "denies",
  creep_kills: "creep_kills",
  neutral_kills: "neutral_kills",
  max_health: "max_health",
  level: "player_level",
  permanent_buffs: "permanent_buffs",
  shots_hit: "shots_hit",
  shots_missed: "shots_missed",
  hero_hits: "hero_bullets_hit",
  crits: "hero_bullets_hit_crit",
} as const satisfies Partial<Record<SortKey, ScoreboardStat>>;

/**
 * A scoreboard's `sort_by` for each shared sort key. Heroes are compared by their average per match; players by
 * their totals, as a leaderboard of "the most kills".
 */
export function scoreboardSort(variant: SortVariant): Partial<Record<SortKey, string>> {
  const stats = Object.entries(SCOREBOARD_STATS).map(([key, stat]) => [key, buildSortByValue(stat, variant)]);
  return { winrate: "winrate", matches: "matches", wins: "wins", losses: "losses", ...Object.fromEntries(stats) };
}

/** The stats both scoreboards sort by, as their tables name them: "kills, deaths, …, hero crit hits". */
export const SCOREBOARD_STAT_NAMES = Object.values(SCOREBOARD_STATS)
  .map((stat) => SORT_CATEGORIES.find((category) => category.key === stat)?.label.toLowerCase() ?? stat)
  .join(", ");
