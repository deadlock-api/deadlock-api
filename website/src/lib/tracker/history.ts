import type { PlayerMatchHistoryEntry } from "deadlock_api_client";

import type { PlaySession } from "./compute";

export type HistoryRow =
  | { kind: "session"; key: string; session: PlaySession }
  | { kind: "match"; key: number; entry: PlayerMatchHistoryEntry; matchIndex: number };

/** Build the full ordering once; the history view only mounts a small range of these rows. */
export function buildHistoryRows(entries: PlayerMatchHistoryEntry[], sessions: Map<number, PlaySession>) {
  const rows: HistoryRow[] = [];
  const matchRowIndexes = new Map<number, number>();
  const stickyIndexes: number[] = [];
  let previousSession: PlaySession | undefined;
  entries.forEach((entry, matchIndex) => {
    const session = sessions.get(entry.match_id);
    if (session && session !== previousSession) {
      stickyIndexes.push(rows.length);
      rows.push({ kind: "session", key: `session-${entry.match_id}`, session });
    }
    previousSession = session;
    matchRowIndexes.set(entry.match_id, rows.length);
    rows.push({ kind: "match", key: entry.match_id, entry, matchIndex });
  });
  return { rows, matchRowIndexes, stickyIndexes };
}

/** Find the session header that belongs above a visible row without scanning the whole history. */
export function historyStickyIndex(indexes: number[], visibleStart: number): number | undefined {
  let left = 0;
  let right = indexes.length - 1;
  let found: number | undefined;
  while (left <= right) {
    const middle = Math.floor((left + right) / 2);
    if (indexes[middle] <= visibleStart) {
      found = indexes[middle];
      left = middle + 1;
    } else right = middle - 1;
  }
  return found;
}
