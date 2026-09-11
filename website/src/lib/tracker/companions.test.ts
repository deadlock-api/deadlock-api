import assert from "node:assert/strict";
import { test } from "node:test";

import type { PlayerMatchHistoryEntry } from "deadlock_api_client";

import { intersectCompanionRows } from "./companions";

function match(id: number, team: number, winner: number): PlayerMatchHistoryEntry {
  return { match_id: id, start_time: id * 1000, player_team: team, match_result: winner } as PlayerMatchHistoryEntry;
}

test("shared stats count only selected matches and wins from the tracked player's team", () => {
  const rows = intersectCompanionRows(
    [
      { id: 99, matches: [1, 2, 3, 4] },
      { id: 88, matches: [3] },
    ],
    [match(1, 1, 1), match(2, 1, 0), match(4, 0, 0)],
  );
  assert.deepEqual(rows, [{ accountId: 99, matches: 3, wins: 2, lastPlayedUnix: 4000 }]);
});

test("duplicate match IDs do not inflate games or wins", () => {
  assert.deepEqual(intersectCompanionRows([{ id: 99, matches: [1, 1, 1] }], [match(1, 0, 0)]), [
    { accountId: 99, matches: 1, wins: 1, lastPlayedUnix: 1000 },
  ]);
});

test("frequent encounters sort by games, recency, then account ID without mutating input", () => {
  const stats = [
    { id: 99, matches: [1] },
    { id: 88, matches: [2] },
    { id: 77, matches: [2] },
    { id: 66, matches: [1, 2] },
  ];
  const original = structuredClone(stats);
  const rows = intersectCompanionRows(stats, [match(1, 0, 0), match(2, 0, 1)]);
  assert.deepEqual(
    rows?.map((row) => row.accountId),
    [66, 77, 88, 99],
  );
  assert.deepEqual(stats, original);
});

test("distinguishes unloaded stats from loaded stats without selected matches", () => {
  assert.equal(intersectCompanionRows(undefined, [match(1, 0, 0)]), undefined);
  assert.deepEqual(intersectCompanionRows([], [match(1, 0, 0)]), []);
  assert.deepEqual(intersectCompanionRows([{ id: 99, matches: [1] }], []), []);
});
