import assert from "node:assert/strict";
import { test } from "node:test";

import { MIN_ITEM_GAMES, sortItemRows, toItemPairRows, toItemRows } from "./item-performance";

const item = (item_id: number, wins: number, matches: number) => ({
  item_id,
  wins,
  matches,
  avg_buy_time_s: 600,
  sold: 1,
});

test("item rows drop rare and unlisted items and compare each with the player's win rate", () => {
  const rows = toItemRows([item(1, 6, 10), item(2, 2, MIN_ITEM_GAMES - 1), item(3, 4, 4)], 0.5, (id) => id !== 3);
  assert.deepEqual(
    rows.map((row) => row.itemId),
    [1],
  );
  const [row] = rows;
  assert.equal(row.winrate, 0.6);
  assert.ok(Math.abs(row.delta - 0.1) < 1e-9);
  assert.equal(row.soldRate, 0.1);
  // Pulled half way to the player's 50%: ten games of prior against ten of its own.
  assert.ok(Math.abs(row.score - 0.55) < 1e-9);
});

test("a win-rate sort ranks proven items above lucky streaks", () => {
  const rows = toItemRows([item(1, 3, 3), item(2, 24, 30), item(3, 10, 30)], 0.5, () => true);
  const id = (row: { itemId: number }) => String(row.itemId);
  assert.deepEqual(
    sortItemRows(rows, "winrate", "desc", id).map((row) => row.itemId),
    [2, 1, 3],
  );
  assert.deepEqual(
    sortItemRows(rows, "winrate", "asc", id).map((row) => row.itemId),
    [3, 1, 2],
  );
  assert.deepEqual(
    sortItemRows(rows, "matches", "desc", id).map((row) => row.itemId),
    [2, 3, 1],
  );
});

test("pair rows keep pairs of listed items only", () => {
  const rows = toItemPairRows(
    [
      { item_ids: [1, 2], wins: 5, matches: 8 },
      { item_ids: [1, 3], wins: 5, matches: 8 },
      { item_ids: [], wins: 5, matches: 8 },
    ],
    0.5,
    (id) => id !== 3,
  );
  assert.deepEqual(
    rows.map((row) => row.itemIds),
    [[1, 2]],
  );
});

test("only a difference beyond the noise of its sample counts as significant", () => {
  const [small, large] = toItemRows([item(1, 4, 5), item(2, 80, 100)], 0.5, () => true);
  assert.equal(small.significant, false);
  assert.equal(large.significant, true);
});
