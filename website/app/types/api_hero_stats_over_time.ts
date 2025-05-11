export interface APIHeroStatsOverTime {
  hero_id: number;
  date_time: number;
  wins: number;
  losses: number;
  matches: number;
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
  "wins",
  "losses",
  "matches",
  "players",
  "total_kills",
  "total_deaths",
  "total_assists",
  "total_net_worth",
  "total_last_hits",
  "total_denies",
] as const;

export const TIME_INTERVALS = ["HOURLY", "DAY", "WEEK"] as const;
