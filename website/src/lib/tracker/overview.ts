import type { PlayerMatchHistoryEntry } from "deadlock_api_client";

import { computeStreaks, summarize } from "./compute";

export const RECENT_MATCH_WINDOWS = [10, 20, 50] as const;
export type RecentMatchWindow = (typeof RECENT_MATCH_WINDOWS)[number];
export const MIN_COMPARISON_MATCHES = 5;

/** Compare non-overlapping windows; never present a tiny baseline as a trend. */
export function compareRecentMatches(entries: PlayerMatchHistoryEntry[], window: RecentMatchWindow = 20) {
  const sorted = [...entries].sort((a, b) => b.start_time - a.start_time || b.match_id - a.match_id);
  const recentEntries = sorted.slice(0, window);
  const previousEntries = sorted.slice(window, window * 2);
  return {
    window,
    entries: recentEntries,
    previousEntries,
    streaks: computeStreaks(sorted),
    recent: summarize(recentEntries),
    previous: previousEntries.length >= MIN_COMPARISON_MATCHES ? summarize(previousEntries) : null,
  };
}

export type RecentMatchComparison = ReturnType<typeof compareRecentMatches>;
