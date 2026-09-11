import type { PlayerMatchHistoryEntry } from "deadlock_api_client";

import { isWin } from "./compute";

export interface CompanionRow {
  accountId: number;
  matches: number;
  wins: number;
  lastPlayedUnix: number;
}

/** Count shared matches from the selected player's perspective, respecting every history filter. */
export function intersectCompanionRows(
  stats: { id: number; matches: number[] }[] | undefined,
  entries: PlayerMatchHistoryEntry[],
): CompanionRow[] | undefined {
  if (!stats) return undefined;
  const entryByMatchId = new Map(entries.map((entry) => [entry.match_id, entry]));
  const rows: CompanionRow[] = [];
  for (const stat of stats) {
    let matches = 0;
    let wins = 0;
    let lastPlayedUnix = 0;
    for (const matchId of new Set(stat.matches)) {
      const entry = entryByMatchId.get(matchId);
      if (!entry) continue;
      matches += 1;
      if (isWin(entry)) wins += 1;
      lastPlayedUnix = Math.max(lastPlayedUnix, entry.start_time);
    }
    if (matches === 0) continue;
    rows.push({ accountId: stat.id, matches, wins, lastPlayedUnix });
  }
  return rows.sort((a, b) => b.matches - a.matches || b.lastPlayedUnix - a.lastPlayedUnix || a.accountId - b.accountId);
}
