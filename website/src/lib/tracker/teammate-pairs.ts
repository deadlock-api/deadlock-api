import type { PlayerMatchHistoryEntry } from "deadlock_api_client";

import type { CompanionRow } from "./companions";
import { isWin } from "./compute";

/** A pair needs this many matches with both on the tracked player's team to be listed. */
export const PAIR_MIN_MATCHES = 2;

export interface TeammatePairRow {
  /** The two teammates, lower account id first. */
  memberIds: [number, number];
  matches: number;
  wins: number;
  lastPlayedUnix: number;
  matchIds: number[];
}

/**
 * Every two teammates who were on the tracked player's team together, from the filtered teammate rows: the matches
 * both of them share with the tracked player, most played first.
 */
export function computeTeammatePairs(
  mates: CompanionRow[] | undefined,
  entries: PlayerMatchHistoryEntry[],
): TeammatePairRow[] | undefined {
  if (!mates) return undefined;
  const entryByMatchId = new Map(entries.map((entry) => [entry.match_id, entry]));
  const candidates = mates
    .filter((mate) => mate.matches >= PAIR_MIN_MATCHES)
    .map((mate) => ({ accountId: mate.accountId, matchIds: new Set(mate.matchIds) }));
  const pairs: TeammatePairRow[] = [];
  for (const [index, first] of candidates.entries()) {
    for (const second of candidates.slice(index + 1)) {
      const matchIds = [...first.matchIds].filter((matchId) => second.matchIds.has(matchId));
      if (matchIds.length < PAIR_MIN_MATCHES) continue;
      let wins = 0;
      let lastPlayedUnix = 0;
      for (const matchId of matchIds) {
        const entry = entryByMatchId.get(matchId);
        if (!entry) continue;
        if (isWin(entry)) wins += 1;
        lastPlayedUnix = Math.max(lastPlayedUnix, entry.start_time);
      }
      const memberIds: [number, number] =
        first.accountId < second.accountId ? [first.accountId, second.accountId] : [second.accountId, first.accountId];
      pairs.push({ memberIds, matches: matchIds.length, wins, lastPlayedUnix, matchIds });
    }
  }
  return pairs.sort(
    (a, b) =>
      b.matches - a.matches ||
      b.lastPlayedUnix - a.lastPlayedUnix ||
      a.memberIds[0] - b.memberIds[0] ||
      a.memberIds[1] - b.memberIds[1],
  );
}
