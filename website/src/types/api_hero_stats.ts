import type { AnalyticsHeroStats } from "deadlock_api_client";

import { type GameMode, hasSoulEconomy } from "~/lib/game-mode";

export const HERO_STATS = [
  "winrate",
  "wins",
  "losses",
  "matches",
  "kills_per_match",
  "deaths_per_match",
  "assists_per_match",
  "net_worth_per_match",
  "last_hits_per_match",
  "denies_per_match",
  "permanent_buffs_per_match",
] as const;

export const HERO_STATS_WITH_BAN_RATE = [...HERO_STATS, "ban_rate"] as const;

/** The hero stats that measure the soul economy, which Street Brawl does not have. */
const ECONOMY_HERO_STATS: ReadonlySet<string> = new Set(["net_worth_per_match"]);

/** The stats worth offering in a game mode: Street Brawl leaves out the economy ones. */
export function heroStatsFor<T extends string>(stats: readonly T[], gameMode: GameMode | undefined): T[] {
  return hasSoulEconomy(gameMode) ? [...stats] : stats.filter((stat) => !ECONOMY_HERO_STATS.has(stat));
}

/** The stat to show in a game mode: an economy one picked elsewhere falls back, while the URL keeps the choice. */
export function heroStatIn<T extends string>(stat: T, gameMode: GameMode | undefined, fallback: T): T {
  return hasSoulEconomy(gameMode) || !ECONOMY_HERO_STATS.has(stat) ? stat : fallback;
}

/** The totals `hero_stats_transform` reads. */
export type HeroStatTotals = Pick<
  AnalyticsHeroStats,
  | "wins"
  | "losses"
  | "matches"
  | "total_kills"
  | "total_deaths"
  | "total_assists"
  | "total_net_worth"
  | "total_last_hits"
  | "total_denies"
  | "total_permanent_buffs"
  | "permanent_buff_matches"
>;

export function hero_stats_transform(heroStats: HeroStatTotals, heroStat: (typeof HERO_STATS)[number]) {
  switch (heroStat) {
    case "winrate":
      return (100 * heroStats.wins) / heroStats.matches;
    case "wins":
      return heroStats.wins;
    case "losses":
      return heroStats.losses;
    case "matches":
      return heroStats.matches;
    case "kills_per_match":
      return heroStats.total_kills / heroStats.matches;
    case "deaths_per_match":
      return heroStats.total_deaths / heroStats.matches;
    case "assists_per_match":
      return heroStats.total_assists / heroStats.matches;
    case "net_worth_per_match":
      return heroStats.total_net_worth / heroStats.matches;
    case "last_hits_per_match":
      return heroStats.total_last_hits / heroStats.matches;
    case "denies_per_match":
      return heroStats.total_denies / heroStats.matches;
    case "permanent_buffs_per_match":
      // Over the matches that carry buff counts, which account-scoped requests only have since build 6712.
      return heroStats.permanent_buff_matches > 0
        ? heroStats.total_permanent_buffs / heroStats.permanent_buff_matches
        : Number.NaN;
  }
}

export type TimeInterval = {
  label: string;
  query: string;
};

export const TIME_INTERVALS: TimeInterval[] = [
  {
    label: "Hour",
    query: "start_time_hour",
  },
  {
    label: "Day",
    query: "start_time_day",
  },
  {
    label: "Week",
    query: "start_time_week",
  },
];

export const BY_RANK_STATS = [...HERO_STATS_WITH_BAN_RATE, "pickrate"] as const;
export type ByRankStat = (typeof BY_RANK_STATS)[number];
