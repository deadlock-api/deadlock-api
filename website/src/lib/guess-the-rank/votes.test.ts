import assert from "node:assert/strict";
import { test } from "node:test";

import type { D1Database, D1PreparedStatement } from "~/lib/worker-env";

import { memoryCache, testDatabase as migratedDatabase } from "./test-database";
import { readResult, recordVote, toRoundResult, voterHash } from "./votes";

const testDatabase = () =>
  migratedDatabase(
    "INSERT INTO videos (id, r2_key, badge, hero_id, match_id, duration_s, added_at) " +
      "VALUES ('v1', 'videos/v1.mp4', 74, 1, 1, 120, '2026-10-01T00:00:00Z')",
  );

const VIDEO = { id: "v1", badge: 74 };

test("a vote counts once per voter, and a second guess keeps the first", async () => {
  const db = testDatabase();
  const first = await recordVote(db, VIDEO, "voter-a", 6);
  assert.deepEqual(first, { badge: 74, tier: 7, guess: 6, stats: { 6: 1 }, total: 1 });

  const again = await recordVote(db, VIDEO, "voter-a", 9);
  assert.deepEqual(again, first);

  const other = await recordVote(db, VIDEO, "voter-b", 6);
  assert.deepEqual(other.stats, { 6: 2 });
  const third = await recordVote(db, VIDEO, "voter-c", 7);
  assert.deepEqual(third, { badge: 74, tier: 7, guess: 7, stats: { 6: 2, 7: 1 }, total: 3 });
});

test("the result is only read back for a voter who voted", async () => {
  const db = testDatabase();
  assert.equal(await readResult(db, VIDEO, "voter-a"), null);
  await recordVote(db, VIDEO, "voter-a", 8);
  assert.deepEqual(await readResult(db, VIDEO, "voter-a"), { badge: 74, tier: 7, guess: 8, stats: { 8: 1 }, total: 1 });
});

/** Counts the database's round trips. */
function countingDatabase(db: D1Database): D1Database & { calls: number } {
  const counted = {
    calls: 0,
    prepare: (query: string) => {
      const wrap = (statement: D1PreparedStatement): D1PreparedStatement => ({
        ...statement,
        bind: (...values: unknown[]) => wrap(statement.bind(...values)),
        all: <T>() => {
          counted.calls++;
          return statement.all<T>();
        },
      });
      return wrap(db.prepare(query));
    },
    batch: <T>(statements: D1PreparedStatement[]) => {
      counted.calls++;
      return db.batch<T>(statements);
    },
  };
  return counted;
}

test("with an edge cache, repeated guesses and result reads do not reach the database", async () => {
  const db = countingDatabase(testDatabase());
  const cache = memoryCache();
  assert.equal(await readResult(db, VIDEO, "voter-a", cache), null);
  assert.equal(await readResult(db, VIDEO, "voter-a", cache), null);
  assert.equal(db.calls, 1);

  const first = await recordVote(db, VIDEO, "voter-a", 6, cache);
  assert.deepEqual(first, { badge: 74, tier: 7, guess: 6, stats: { 6: 1 }, total: 1 });
  assert.equal(db.calls, 2);

  for (let i = 0; i < 5; i++) {
    assert.deepEqual(await recordVote(db, VIDEO, "voter-a", 9, cache), first);
    assert.deepEqual(await readResult(db, VIDEO, "voter-a", cache), first);
  }
  assert.equal(db.calls, 2);
});

test("the voter id is a salted hash per address and video", async () => {
  const a = await voterHash("203.0.113.7", "v1");
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.equal(a, await voterHash("203.0.113.7", "v1"));
  assert.notEqual(a, await voterHash("203.0.113.7", "v2"));
  assert.notEqual(a, await voterHash("203.0.113.8", "v1"));
  assert.ok(!a.includes("203"));
});

test("rows that are not counts are left out of the tally", () => {
  assert.deepEqual(
    toRoundResult(
      116,
      [{ tier: 11 }],
      [
        { tier: 11, count: 2 },
        { tier: "x", count: 1 },
        { tier: 3, count: 0 },
      ],
    ),
    {
      badge: 116,
      tier: 11,
      guess: 11,
      stats: { 11: 2 },
      total: 2,
    },
  );
});
