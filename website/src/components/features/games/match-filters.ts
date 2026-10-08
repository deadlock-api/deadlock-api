import type { AnalyticsApiGameStatsRequest } from "deadlock_api_client";

/** Past this few matches are left, so the curves swing (as on the player comparison's timeline). */
export const LAST_MINUTE = 45;

export const minuteLabel = (seconds: number) => `${Math.round(seconds / 60)}m`;

/** The page's match filters, which the buff stats and the performance curve read like the game stats. */
export function matchFilters({
  gameMode,
  matchMode,
  minUnixTimestamp,
  maxUnixTimestamp,
  minDurationS,
  maxDurationS,
  minAverageBadge,
  maxAverageBadge,
}: AnalyticsApiGameStatsRequest) {
  return {
    gameMode,
    matchMode,
    minUnixTimestamp,
    maxUnixTimestamp,
    minDurationS,
    maxDurationS,
    minAverageBadge,
    maxAverageBadge,
  };
}
