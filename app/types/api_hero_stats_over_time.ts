export interface APIHeroStatsOverTime {
  hero_id: number;
  date_time: number;
  wins: number;
  losses: number;
  matches: number;
  total_matches: number;
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

export function hero_stats_transform(heroStats: APIHeroStatsOverTime, heroStat: (typeof HERO_STATS)[number]) {
  switch (heroStat) {
    case "winrate":
      return (100 * heroStats.wins) / heroStats.matches;
    case "pickrate":
      return (100 * heroStats.matches) / heroStats.total_matches;
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

export const TIME_INTERVALS = ["HOUR", "DAY"] as const;
