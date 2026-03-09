export const CACHE_DURATIONS = {
  /** Asset data that never changes during a session */
  FOREVER: Number.POSITIVE_INFINITY,
  /** Analytics data refreshed daily */
  ONE_DAY: 24 * 60 * 60 * 1000,
  /** Leaderboard/matchup data refreshed hourly */
  ONE_HOUR: 60 * 60 * 1000,
  /** Patron status, combo data */
  FIVE_MINUTES: 5 * 60 * 1000,
} as const;
