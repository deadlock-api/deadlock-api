import assert from "node:assert/strict";
import { test } from "node:test";

import type { PlayerMatchHistoryEntry } from "deadlock_api_client";

import { intersectCompanionRows, sortCompanionRows } from "./companions";

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

test("win-rate sorting uses rates, favors larger tied samples, and never mutates rows", () => {
  const rows = [
    { accountId: 1, matches: 20, wins: 10, lastPlayedUnix: 100 },
    { accountId: 2, matches: 4, wins: 3, lastPlayedUnix: 200 },
    { accountId: 3, matches: 12, wins: 9, lastPlayedUnix: 300 },
    { accountId: 4, matches: 10, wins: 0, lastPlayedUnix: 400 },
  ];
  const original = [...rows];
  assert.deepEqual(
    sortCompanionRows(rows, "winrate", "desc").map((row) => row.accountId),
    [3, 2, 1, 4],
  );
  assert.deepEqual(
    sortCompanionRows(rows, "winrate", "asc").map((row) => row.accountId),
    [4, 1, 3, 2],
  );
  assert.deepEqual(
    sortCompanionRows(rows, "wins", "desc").map((row) => row.accountId),
    [1, 3, 2, 4],
  );
  assert.deepEqual(
    sortCompanionRows(rows, "lastPlayedUnix", "desc").map((row) => row.accountId),
    [4, 3, 2, 1],
  );
  assert.deepEqual(
    sortCompanionRows(rows, "matches", "asc").map((row) => row.accountId),
    [2, 4, 3, 1],
  );
  assert.deepEqual(rows, original);
});
