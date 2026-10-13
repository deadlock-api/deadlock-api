import assert from "node:assert/strict";
import { test } from "node:test";

import type { PlayerMatchHistoryEntry } from "deadlock_api_client";

import type { CompanionRow } from "./companions";
import { computeTeammatePairs } from "./teammate-pairs";

function match(id: number, won: boolean): PlayerMatchHistoryEntry {
  return { match_id: id, start_time: id * 1000, player_team: 0, match_result: won ? 0 : 1 } as PlayerMatchHistoryEntry;
}

function mate(accountId: number, matchIds: number[]): CompanionRow {
  return { accountId, matches: matchIds.length, wins: 0, lastPlayedUnix: 0, matchIds };
}

const entries = [match(1, true), match(2, false), match(3, true), match(4, true), match(5, false)];

test("a pair counts only the matches where both teammates were on the team", () => {
  assert.deepEqual(computeTeammatePairs([mate(20, [2, 3, 5]), mate(10, [1, 2, 3, 4])], entries), [
    { memberIds: [10, 20], matches: 2, wins: 1, lastPlayedUnix: 3000, matchIds: [2, 3] },
  ]);
});

test("pairs with fewer than two shared matches are left out", () => {
  assert.deepEqual(computeTeammatePairs([mate(10, [1, 2, 3]), mate(20, [3, 4]), mate(30, [5])], entries), []);
});

test("pairs sort by shared matches, then by recency", () => {
  const pairs = computeTeammatePairs([mate(10, [1, 2, 3, 4]), mate(20, [1, 2]), mate(30, [3, 4, 5])], entries);
  assert.deepEqual(
    pairs?.map((pair) => pair.memberIds),
    [
      [10, 30],
      [10, 20],
    ],
  );
});

test("unloaded teammates give no pairs", () => {
  assert.equal(computeTeammatePairs(undefined, entries), undefined);
});
