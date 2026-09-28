/** The fields of a match history entry the pair records read. */
export interface PairMatchEntry {
  match_id: number;
  player_team: number;
  /** The winning team. */
  match_result: number;
  start_time: number;
}

export interface PairPlayerHistory {
  accountId: number;
  /** Undefined while the history loads or after it failed: the player's pairs are left out until it arrives. */
  matches: readonly PairMatchEntry[] | undefined;
}

export interface PlayerPair {
  /** The first player of the pair, in the order the players were compared. */
  a: number;
  b: number;
  /** Matches on the same team, and how many of them that team won. */
  together: { matches: number; wins: number };
  /** Matches on opposite teams, and how many of them each side won. */
  against: { matches: number; aWins: number; bWins: number };
  /** Unix start time of the newest shared match, together or against; null when they never met. */
  lastMet: number | null;
  /** Every shared match, newest first. */
  matchIds: number[];
}

export function pairMatchCount(pair: PlayerPair): number {
  return pair.together.matches + pair.against.matches;
}

/** Every pair of players whose histories both loaded, in comparison order. */
export function playerPairs(histories: readonly PairPlayerHistory[]): PlayerPair[] {
  const pairs: PlayerPair[] = [];
  for (let i = 0; i < histories.length; i += 1) {
    for (let j = i + 1; j < histories.length; j += 1) {
      const first = histories[i];
      const second = histories[j];
      if (!first.matches || !second.matches) continue;
      pairs.push(pairRecord(first.accountId, first.matches, second.accountId, second.matches));
    }
  }
  return pairs;
}

function pairRecord(
  a: number,
  aMatches: readonly PairMatchEntry[],
  b: number,
  bMatches: readonly PairMatchEntry[],
): PlayerPair {
  const bById = new Map(bMatches.map((entry) => [entry.match_id, entry]));
  const together = { matches: 0, wins: 0 };
  const against = { matches: 0, aWins: 0, bWins: 0 };
  const shared: { matchId: number; startTime: number }[] = [];
  const seen = new Set<number>();
  for (const entry of aMatches) {
    const other = bById.get(entry.match_id);
    if (!other || seen.has(entry.match_id)) continue;
    seen.add(entry.match_id);
    shared.push({ matchId: entry.match_id, startTime: entry.start_time });
    const aWon = entry.match_result === entry.player_team;
    if (entry.player_team === other.player_team) {
      together.matches += 1;
      if (aWon) together.wins += 1;
    } else {
      against.matches += 1;
      if (aWon) against.aWins += 1;
      else if (other.match_result === other.player_team) against.bWins += 1;
    }
  }
  shared.sort((x, y) => y.startTime - x.startTime);
  return {
    a,
    b,
    together,
    against,
    lastMet: shared[0]?.startTime ?? null,
    matchIds: shared.map((match) => match.matchId),
  };
}

/**
 * The pairs that met, most shared matches first (then the most recent meeting), and the pairs that never did, in
 * comparison order.
 */
export function splitPairs(pairs: readonly PlayerPair[]): { met: PlayerPair[]; neverMet: PlayerPair[] } {
  const met = pairs
    .filter((pair) => pairMatchCount(pair) > 0)
    .sort((x, y) => pairMatchCount(y) - pairMatchCount(x) || (y.lastMet ?? 0) - (x.lastMet ?? 0));
  const neverMet = pairs.filter((pair) => pairMatchCount(pair) === 0);
  return { met, neverMet };
}
