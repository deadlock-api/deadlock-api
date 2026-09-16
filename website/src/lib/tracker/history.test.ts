import assert from "node:assert/strict";
import { test } from "node:test";

import type { PlayerMatchHistoryEntry } from "deadlock_api_client";

import type { PlaySession } from "./compute";
import { buildHistoryRows, historyStickyIndex } from "./history";

const entry = (id: number) => ({ match_id: id }) as PlayerMatchHistoryEntry;
const session = (id: number) => ({ id }) as PlaySession;

test("history row indexes account for session headers without changing match order", () => {
  const entries = [entry(30), entry(20), entry(10)];
  const newer = session(2);
  const older = session(1);
  const sessions = new Map([
    [30, newer],
    [20, newer],
    [10, older],
  ]);
  const { rows, matchRowIndexes, stickyIndexes } = buildHistoryRows(entries, sessions);
  assert.deepEqual(
    rows.map((row) => row.key),
    ["session-30", 30, 20, "session-10", 10],
  );
  assert.deepEqual(
    [...matchRowIndexes],
    [
      [30, 1],
      [20, 2],
      [10, 4],
    ],
  );
  assert.deepEqual(stickyIndexes, [0, 3]);
  assert.deepEqual(
    rows.flatMap((row) => (row.kind === "match" ? [row.matchIndex] : [])),
    [0, 1, 2],
  );
  assert.deepEqual(
    entries.map((row) => row.match_id),
    [30, 20, 10],
  );
  assert.equal(rows[0].kind === "session" && rows[0].session, newer);
});

test("non-date sorts and empty histories keep direct indexes without sticky headers", () => {
  const { rows, matchRowIndexes, stickyIndexes } = buildHistoryRows([entry(10), entry(30), entry(20)], new Map());
  assert.deepEqual(
    rows.map((row) => row.key),
    [10, 30, 20],
  );
  assert.deepEqual(
    [...matchRowIndexes],
    [
      [10, 0],
      [30, 1],
      [20, 2],
    ],
  );
  assert.deepEqual(stickyIndexes, []);
  assert.deepEqual(buildHistoryRows([], new Map()).rows, []);
});

test("sticky session lookup follows the first visible row at both list boundaries", () => {
  assert.equal(historyStickyIndex([], 0), undefined);
  assert.equal(historyStickyIndex([2, 8, 20], 0), undefined);
  assert.equal(historyStickyIndex([2, 8, 20], 2), 2);
  assert.equal(historyStickyIndex([2, 8, 20], 7), 2);
  assert.equal(historyStickyIndex([2, 8, 20], 8), 8);
  assert.equal(historyStickyIndex([2, 8, 20], 19), 8);
  assert.equal(historyStickyIndex([2, 8, 20], 20), 20);
  assert.equal(historyStickyIndex([2, 8, 20], 1000), 20);
});
