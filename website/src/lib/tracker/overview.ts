import type { PlayerMatchHistoryEntry } from "deadlock_api_client";

import { computeStreaks, summarize } from "./compute";

/** Compare non-overlapping windows; never present a tiny baseline as a trend. */
export function compareRecentMatches(entries: PlayerMatchHistoryEntry[]) {
  const sorted = [...entries].sort((a, b) => b.start_time - a.start_time || b.match_id - a.match_id);
  const recentEntries = sorted.slice(0, 20);
  const previousEntries = sorted.slice(20, 40);
  return {
    entries: recentEntries,
    streaks: computeStreaks(sorted),
    recent: summarize(recentEntries),
    previous: previousEntries.length >= 5 ? summarize(previousEntries) : null,
  };
}
