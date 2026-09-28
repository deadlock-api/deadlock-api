import assert from "node:assert/strict";
import { test } from "node:test";

import { FAVORITE_ITEM_COUNT, favoriteItems, type ItemMeta, type PlayerItemStatRow } from "./compare-items";

function row(item_id: number, matches: number, wins = Math.round(matches / 2), sell = 0): PlayerItemStatRow {
  return { item_id, matches, wins, avg_buy_time_s: 600, avg_sell_time_s: sell };
}

function item(id: number, item_tier = 2, extra: Partial<ItemMeta> = {}): ItemMeta {
  return { id, item_tier, shopable: true, ...extra };
}

test("favoriteItems ranks by matches bought, the id breaking ties", () => {
  const items = [item(1), item(2), item(3)];
  const result = favoriteItems([row(3, 10), row(1, 40), row(2, 10)], items, 100);
  assert.deepEqual(
    result.map((entry) => entry.itemId),
    [1, 2, 3],
  );
});

test("favoriteItems drops tier 1, unknown, unshopable, disabled and rare items", () => {
  const items = [item(1, 1), item(2, 3, { shopable: false }), item(3, 3, { disabled: true }), item(4, 4), item(5)];
  const result = favoriteItems([row(1, 90), row(2, 80), row(3, 70), row(4, 20), row(5, 2), row(6, 60)], items, 100);
  assert.deepEqual(
    result.map((entry) => entry.itemId),
    [4],
  );
});

test("favoriteItems computes share and win rate, capping the share at one", () => {
  const [first, second] = favoriteItems([row(1, 12, 9, 1500), row(2, 6, 3)], [item(1), item(2)], 10);
  assert.equal(first.share, 1);
  assert.equal(first.winRate, 0.75);
  assert.equal(first.avgSellTimeS, 1500);
  assert.equal(second.share, 0.6);
  assert.equal(second.avgSellTimeS, null);
});

test("favoriteItems keeps the limit and returns nothing without matches", () => {
  const items = Array.from({ length: 12 }, (_, index) => item(index + 1));
  const rows = items.map((entry) => row(entry.id, 10 + entry.id));
  assert.equal(favoriteItems(rows, items, 100).length, FAVORITE_ITEM_COUNT);
  assert.equal(favoriteItems(rows, items, 100, 3).length, 3);
  assert.deepEqual(favoriteItems(rows, items, 0), []);
});
