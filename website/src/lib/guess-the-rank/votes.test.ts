import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";

import type { D1Database, D1PreparedStatement } from "~/lib/worker-env";

import { readResult, recordVote, toRoundResult, voterHash } from "./votes";

const SCHEMA = readFileSync(path.join(import.meta.dirname, "../../../migrations/guess-the-rank/0001_init.sql"), "utf8");

interface Statement extends D1PreparedStatement {
  run(): Record<string, unknown>[];
}

/** D1 over node:sqlite: a batch runs its statements in order, in one transaction, like D1's. */
function testDatabase(): D1Database {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(SCHEMA);
  sqlite.exec(
    "INSERT INTO videos (id, r2_key, badge, hero_id, match_id, duration_s, added_at) " +
      "VALUES ('v1', 'videos/v1.mp4', 74, 1, 1, 120, '2026-10-01T00:00:00Z')",
  );
  const prepare = (query: string, values: unknown[] = []): Statement => ({
    bind: (...next: unknown[]) => prepare(query, next),
    run: () => {
      const statement = sqlite.prepare(query);
      const params = values as (string | number)[];
      if (/^\s*select/i.test(query)) return statement.all(...params) as Record<string, unknown>[];
      statement.run(...params);
      return [];
    },
    all: async <T>() => ({ results: prepare(query, values).run() as T[] }),
  });
  return {
    prepare: (query) => prepare(query),
    batch: async <T>(statements: D1PreparedStatement[]) => {
      sqlite.exec("BEGIN");
      try {
        const results = statements.map((statement) => ({ results: (statement as Statement).run() as T[] }));
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
}

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
