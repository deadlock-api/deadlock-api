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
  /** Each player's matches without the other (not together, not against), and how many they won. */
  apart: { aMatches: number; aWins: number; bMatches: number; bWins: number };
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
  const apart = { aMatches: 0, aWins: 0, bMatches: 0, bWins: 0 };
  for (const entry of aMatches) {
    if (bById.has(entry.match_id)) continue;
    apart.aMatches += 1;
    if (entry.match_result === entry.player_team) apart.aWins += 1;
  }
  const aIds = new Set(aMatches.map((entry) => entry.match_id));
  for (const entry of bMatches) {
    if (aIds.has(entry.match_id)) continue;
    apart.bMatches += 1;
    if (entry.match_result === entry.player_team) apart.bWins += 1;
  }
  shared.sort((x, y) => y.startTime - x.startTime);
  return {
    a,
    b,
    together,
    against,
    apart,
    lastMet: shared[0]?.startTime ?? null,
    matchIds: shared.map((match) => match.matchId),
  };
}

/** Fewer matches together than this and the duo's synergy is noise. */
export const MIN_SYNERGY_MATCHES = 5;

/**
 * How much better (or worse) a duo wins together than apart: their win rate as teammates minus the average of each
 * one's win rate in the matches without the other. Null under `MIN_SYNERGY_MATCHES` together, or when either has no
 * match apart.
 */
export function pairSynergy(pair: PlayerPair): number | null {
  const { together, apart } = pair;
  if (together.matches < MIN_SYNERGY_MATCHES || apart.aMatches === 0 || apart.bMatches === 0) return null;
  const apartRate = (apart.aWins / apart.aMatches + apart.bWins / apart.bMatches) / 2;
  return together.wins / together.matches - apartRate;
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

/** The fields of a match history entry a shared match line reads. */
export interface SharedMatchEntry extends PairMatchEntry {
  hero_id: number;
  player_kills: number;
  player_deaths: number;
  player_assists: number;
}

export interface SharedMatchHistory {
  accountId: number;
  /** Undefined while the history loads or after it failed: the player is left out until it arrives. */
  matches: readonly SharedMatchEntry[] | undefined;
}

export interface SharedMatchPlayer {
  accountId: number;
  heroId: number;
  kills: number;
  deaths: number;
  assists: number;
}

export interface SharedMatchTeam {
  team: number;
  won: boolean;
  /** The compared players on this team, in comparison order. */
  players: SharedMatchPlayer[];
}

export interface SharedMatch {
  matchId: number;
  startTime: number;
  /** One team when the players were all teammates, two when some faced each other; the first player's team first. */
  teams: SharedMatchTeam[];
}

/** The newest matches (at most `limit`) in which two or more of the players played, together or against. */
export function recentSharedMatches(histories: readonly SharedMatchHistory[], limit = 6): SharedMatch[] {
  const byMatch = new Map<number, { entry: SharedMatchEntry; accountId: number }[]>();
  for (const history of histories) {
    if (!history.matches) continue;
    for (const entry of history.matches) {
      const players = byMatch.get(entry.match_id);
      if (!players) byMatch.set(entry.match_id, [{ entry, accountId: history.accountId }]);
      // A duplicated entry counts its player once.
      else if (!players.some((player) => player.accountId === history.accountId)) {
        players.push({ entry, accountId: history.accountId });
      }
    }
  }
  const shared = [...byMatch.values()].filter((players) => players.length >= 2);
  shared.sort((x, y) => y[0].entry.start_time - x[0].entry.start_time || y[0].entry.match_id - x[0].entry.match_id);
  return shared.slice(0, limit).map((players) => {
    const teams: SharedMatchTeam[] = [];
    for (const { entry, accountId } of players) {
      let team = teams.find((candidate) => candidate.team === entry.player_team);
      if (!team) {
        team = { team: entry.player_team, won: entry.match_result === entry.player_team, players: [] };
        teams.push(team);
      }
      team.players.push({
        accountId,
        heroId: entry.hero_id,
        kills: entry.player_kills,
        deaths: entry.player_deaths,
        assists: entry.player_assists,
      });
    }
    const { entry } = players[0];
    return { matchId: entry.match_id, startTime: entry.start_time, teams };
  });
}
