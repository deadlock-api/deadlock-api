import assert from "node:assert/strict";
import { test } from "node:test";

import {
  duoHeroPairs,
  MIN_SYNERGY_MATCHES,
  type PairMatchEntry,
  pairMatchCount,
  pairSynergy,
  playerPairs,
  recentSharedMatches,
  type SharedMatchEntry,
  splitPairs,
} from "./player-compare-pairs";

function entry(matchId: number, team: number, winner: number, startTime = matchId): PairMatchEntry {
  return { match_id: matchId, player_team: team, match_result: winner, start_time: startTime };
}

test("playerPairs counts matches together with their record", () => {
  const [pair] = playerPairs([
    { accountId: 1, matches: [entry(10, 0, 0), entry(11, 1, 0), entry(12, 1, 1)] },
    { accountId: 2, matches: [entry(10, 0, 0), entry(11, 1, 0), entry(99, 0, 0)] },
  ]);
  assert.deepEqual(pair.together, { matches: 2, wins: 1 });
  assert.deepEqual(pair.against, { matches: 0, aWins: 0, bWins: 0 });
  assert.equal(pair.lastMet, 11);
  assert.deepEqual(pair.matchIds, [11, 10]);
});

test("playerPairs counts matches against each other from the first player's side", () => {
  const [pair] = playerPairs([
    { accountId: 1, matches: [entry(20, 0, 0), entry(21, 0, 1), entry(22, 1, 1)] },
    { accountId: 2, matches: [entry(20, 1, 0), entry(21, 1, 1), entry(22, 0, 1)] },
  ]);
  assert.equal(pair.a, 1);
  assert.equal(pair.b, 2);
  assert.deepEqual(pair.against, { matches: 3, aWins: 2, bWins: 1 });
  assert.equal(pair.together.matches, 0);
});

test("playerPairs builds every pair in comparison order and skips histories still loading", () => {
  const pairs = playerPairs([
    { accountId: 1, matches: [] },
    { accountId: 2, matches: undefined },
    { accountId: 3, matches: [] },
    { accountId: 4, matches: [] },
  ]);
  assert.deepEqual(
    pairs.map((pair) => [pair.a, pair.b]),
    [
      [1, 3],
      [1, 4],
      [3, 4],
    ],
  );
  assert.equal(pairs[0].lastMet, null);
});

test("playerPairs counts a duplicated entry once", () => {
  const [pair] = playerPairs([
    { accountId: 1, matches: [entry(5, 0, 0), entry(5, 0, 0)] },
    { accountId: 2, matches: [entry(5, 0, 0)] },
  ]);
  assert.equal(pairMatchCount(pair), 1);
});

test("splitPairs sorts by shared matches and sets aside pairs that never met", () => {
  const pairs = playerPairs([
    { accountId: 1, matches: [entry(1, 0, 0), entry(2, 0, 0), entry(3, 0, 0)] },
    { accountId: 2, matches: [entry(1, 0, 0)] },
    { accountId: 3, matches: [entry(2, 1, 0), entry(3, 0, 0)] },
    { accountId: 4, matches: [] },
  ]);
  const { met, neverMet } = splitPairs(pairs);
  assert.deepEqual(
    met.map((pair) => [pair.a, pair.b]),
    [
      [1, 3],
      [1, 2],
    ],
  );
  assert.deepEqual(
    neverMet.map((pair) => [pair.a, pair.b]),
    [
      [1, 4],
      [2, 3],
      [2, 4],
      [3, 4],
    ],
  );
});

test("splitPairs breaks a tie on the most recent meeting", () => {
  const pairs = playerPairs([
    { accountId: 1, matches: [entry(1, 0, 0, 100), entry(2, 0, 0, 200)] },
    { accountId: 2, matches: [entry(1, 0, 0, 100)] },
    { accountId: 3, matches: [entry(2, 0, 0, 200)] },
  ]);
  assert.deepEqual(
    splitPairs(pairs).met.map((pair) => pair.b),
    [3, 2],
  );
});

function played(matchId: number, team: number, winner: number, startTime = matchId, heroId = 1): SharedMatchEntry {
  return {
    ...entry(matchId, team, winner, startTime),
    hero_id: heroId,
    player_kills: matchId,
    player_deaths: 2,
    player_assists: 3,
  };
}

test("recentSharedMatches keeps matches two or more players shared, newest first, up to the limit", () => {
  const matches = recentSharedMatches(
    [
      {
        accountId: 1,
        matches: [played(1, 0, 0, 100), played(2, 0, 0, 300), played(3, 0, 0, 200), played(4, 0, 0, 400)],
      },
      { accountId: 2, matches: [played(1, 0, 0, 100), played(2, 1, 0, 300), played(9, 0, 0, 900)] },
      { accountId: 3, matches: [played(3, 0, 0, 200), played(2, 0, 0, 300)] },
    ],
    2,
  );
  assert.deepEqual(
    matches.map((match) => [match.matchId, match.startTime]),
    [
      [2, 300],
      [3, 200],
    ],
  );
});

test("recentSharedMatches groups the players by team, the first player's team first", () => {
  const [match] = recentSharedMatches([
    { accountId: 1, matches: [played(7, 1, 0, 7, 11)] },
    { accountId: 2, matches: [played(7, 0, 0, 7, 12)] },
    { accountId: 3, matches: [played(7, 1, 0, 7, 13)] },
  ]);
  assert.deepEqual(
    match.teams.map((team) => ({ team: team.team, won: team.won, players: team.players.map((p) => p.accountId) })),
    [
      { team: 1, won: false, players: [1, 3] },
      { team: 0, won: true, players: [2] },
    ],
  );
  assert.deepEqual(match.teams[0].players[1], { accountId: 3, heroId: 13, kills: 7, deaths: 2, assists: 3 });
});

test("recentSharedMatches skips loading histories and counts a duplicated entry once", () => {
  assert.deepEqual(
    recentSharedMatches([
      { accountId: 1, matches: [played(5, 0, 0), played(5, 0, 0)] },
      { accountId: 2, matches: undefined },
    ]),
    [],
  );
  const [match] = recentSharedMatches([
    { accountId: 1, matches: [played(5, 0, 0), played(5, 0, 0)] },
    { accountId: 2, matches: [played(5, 0, 0)] },
  ]);
  assert.deepEqual(
    match.teams.map((team) => team.players.length),
    [2],
  );
});

test("pairSynergy: together's win rate against the average of each one's win rate apart", () => {
  const together = Array.from({ length: MIN_SYNERGY_MATCHES * 2 }, (_, i) => entry(100 + i, 0, i < 8 ? 0 : 1));
  // Apart: player 1 wins 1 of 2, player 2 wins 1 of 4.
  const [pair] = playerPairs([
    { accountId: 1, matches: [...together, entry(1, 0, 0), entry(2, 0, 1)] },
    { accountId: 2, matches: [...together, entry(3, 0, 0), entry(4, 0, 1), entry(5, 0, 1), entry(6, 0, 1)] },
  ]);
  assert.deepEqual(pair.apart, { aMatches: 2, aWins: 1, bMatches: 4, bWins: 1 });
  assert.ok(Math.abs((pairSynergy(pair) ?? 0) - (0.8 - (0.5 + 0.25) / 2)) < 1e-9);
});

test("pairSynergy needs enough matches together and some apart", () => {
  const few = Array.from({ length: MIN_SYNERGY_MATCHES - 1 }, (_, i) => entry(100 + i, 0, 0));
  const [short] = playerPairs([
    { accountId: 1, matches: [...few, entry(1, 0, 0)] },
    { accountId: 2, matches: [...few, entry(2, 0, 0)] },
  ]);
  assert.equal(pairSynergy(short), null);
  const many = Array.from({ length: MIN_SYNERGY_MATCHES }, (_, i) => entry(100 + i, 0, 0));
  const [onlyTogether] = playerPairs([
    { accountId: 1, matches: many },
    { accountId: 2, matches: [...many, entry(2, 0, 0)] },
  ]);
  assert.equal(pairSynergy(onlyTogether), null);
});

test("duoHeroPairs counts same-team hero pairings, most played first", () => {
  const shared = (matchId: number, team: number, winner: number, heroId: number): SharedMatchEntry => ({
    ...entry(matchId, team, winner),
    hero_id: heroId,
    player_kills: 0,
    player_deaths: 0,
    player_assists: 0,
  });
  const a = [1, 2, 3, 4, 5, 6].map((id) => shared(id, 0, id <= 2 ? 0 : 1, id <= 4 ? 7 : 8));
  const b = [
    ...[1, 2, 3, 4].map((id) => shared(id, 0, id <= 2 ? 0 : 1, 12)),
    shared(5, 1, 1, 12), // against: not a duo
    shared(6, 0, 1, 15),
  ];
  const pairs = duoHeroPairs(a, b, 3, 1);
  assert.deepEqual(pairs[0], { aHero: 7, bHero: 12, matches: 4, wins: 2 });
  assert.equal(pairs.length, 2);
  assert.equal(duoHeroPairs(a, b).length, 1);
});
