export interface APIHeroStats {
  hero_id: number;
  bucket: number;
  wins: number;
  losses: number;
  matches: number;
  matches_per_bucket: number;
  players: number;
  total_kills: number;
  total_deaths: number;
  total_assists: number;
  total_net_worth: number;
  total_last_hits: number;
  total_denies: number;
}

export const HERO_STATS = [
  "winrate",
  "pickrate",
  "wins",
  "losses",
  "matches",
  "players",
  "kills_per_match",
  "deaths_per_match",
  "assists_per_match",
  "net_worth_per_match",
  "last_hits_per_match",
  "denies_per_match",
] as const;

export function hero_stats_transform(heroStats: APIHeroStats, heroStat: (typeof HERO_STATS)[number]) {
  switch (heroStat) {
    case "winrate":
      return (100 * heroStats.wins) / heroStats.matches;
    case "pickrate":
      return (100 * heroStats.matches * 12) / heroStats.matches_per_bucket;
    case "wins":
      return heroStats.wins;
    case "losses":
      return heroStats.losses;
    case "matches":
      return heroStats.matches;
    case "players":
      return heroStats.players;
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
