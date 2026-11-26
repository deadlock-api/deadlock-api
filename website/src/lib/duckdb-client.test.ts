import assert from "node:assert/strict";
import { test } from "node:test";

import { findTableNames, sharedUntilRejected, viewCreationOrder } from "./duckdb-client";

const KNOWN = ["leaderboard", "hero_leaderboard", "match_player"];

test("findTableNames finds every table of a comma join", () => {
  assert.deepEqual(findTableNames("SELECT * FROM leaderboard l, hero_leaderboard h", KNOWN), [
    "leaderboard",
    "hero_leaderboard",
  ]);
});

test("findTableNames finds tables in subqueries and CTEs, in any case and quoted", () => {
  const sql = `WITH p AS (SELECT * FROM "Match_Player") SELECT * FROM p WHERE x IN (SELECT 1 FROM LEADERBOARD)`;
  assert.deepEqual(findTableNames(sql, KNOWN), ["match_player", "leaderboard"]);
});

test("findTableNames ignores names that are only part of a word", () => {
  assert.deepEqual(findTableNames("SELECT leaderboard_position FROM my_leaderboard_copy", KNOWN), []);
});

test("findTableNames finds names with a schema and tables before a column", () => {
  const known = [...KNOWN, "assets.heroes", "assets.items"];
  const sql = "SELECT h.name, match_player.account_id FROM match_player JOIN assets.heroes h ON h.id = hero_id";
  assert.deepEqual(findTableNames(sql, known), ["match_player", "assets.heroes"]);
  assert.deepEqual(findTableNames("SELECT heroes, items FROM t", known), []);
});

test("viewCreationOrder puts what a view reads before it and drops unknown names", () => {
  const tables = new Map([
    ["match_player", ["a.parquet"]],
    ["leaderboard", ["b.parquet"]],
  ]);
  const views = new Map([
    ["match_player_latest", "SELECT * FROM match_player QUALIFY row_number() OVER () = 1"],
    ["assets.heroes", "SELECT * FROM read_json('https://example.com/heroes')"],
  ]);
  assert.deepEqual(viewCreationOrder(["match_player_latest", "assets.heroes", "nope"], tables, views), [
    "match_player",
    "match_player_latest",
    "assets.heroes",
  ]);
});

test("sharedUntilRejected shares one pending attempt between concurrent callers", async () => {
  let calls = 0;
  let resolve!: (value: number) => void;
  const get = sharedUntilRejected(() => {
    calls += 1;
    return new Promise<number>((r) => {
      resolve = r;
    });
  });
  const first = get();
  const second = get();
  assert.equal(first, second);
  resolve(42);
  assert.equal(await first, 42);
  assert.equal(await get(), 42);
  assert.equal(calls, 1);
});

test("sharedUntilRejected retries after a rejection", async () => {
  let calls = 0;
  const get = sharedUntilRejected(async () => {
    calls += 1;
    if (calls === 1) throw new Error("init failed");
    return "ready";
  });
  const first = get();
  const concurrent = get();
  assert.equal(first, concurrent);
  await assert.rejects(first, /init failed/);
  assert.equal(await get(), "ready");
  assert.equal(await get(), "ready");
  assert.equal(calls, 2);
});
