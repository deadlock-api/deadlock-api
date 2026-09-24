import assert from "node:assert/strict";
import { test } from "node:test";

import { findTableNames } from "./duckdb-client";

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
