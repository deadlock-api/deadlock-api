import assert from "node:assert/strict";
import { test } from "node:test";

import { type PairMatchEntry, pairMatchCount, playerPairs, splitPairs } from "./player-compare-pairs";

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
