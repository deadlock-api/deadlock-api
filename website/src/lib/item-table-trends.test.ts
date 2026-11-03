import assert from "node:assert/strict";
import { test } from "node:test";

import { itemKeptRate, itemTierTotals, itemVsTier } from "~/lib/item-table-trends";
import { formatAxisTick, formatStatValue } from "~/lib/stat-format";

const rows = [
  { item_id: 1, tier: 4, wins: 60, matches: 100 },
  { item_id: 2, tier: 4, wins: 50, matches: 100 },
  { item_id: 3, tier: 4, wins: 220, matches: 400 },
  { item_id: 4, tier: 1, wins: 10, matches: 20 },
];

test("an item is measured against its own tier's pooled counts", () => {
  const totals = itemTierTotals(rows, (row) => row.tier);
  assert.deepEqual(totals.get(4), { wins: 330, matches: 600, items: 3 });
  const measured = itemVsTier(rows[0], totals.get(4));
  assert.equal(measured.tierWinRate, 0.55);
  assert.ok(Math.abs(measured.vsTier - 0.05) < 1e-12);
  // The tier's average item has 200 purchases.
  assert.equal(measured.pickVsTier, 0.5);
  assert.equal(itemVsTier(rows[2], totals.get(4)).pickVsTier, 2);
});

test("an item alone in its tier is level with it", () => {
  const totals = itemTierTotals(rows, (row) => row.tier);
  assert.deepEqual(itemVsTier(rows[3], totals.get(1)), { tierWinRate: 0.5, vsTier: 0, pickVsTier: 1 });
  assert.deepEqual(itemVsTier(rows[3], undefined), { tierWinRate: 0.5, vsTier: 0, pickVsTier: 1 });
});

test("kept is the share of purchases never sold or upgraded", () => {
  assert.equal(itemKeptRate({ matches: 200, sold: 50 }), 0.75);
  assert.equal(itemKeptRate({ matches: 200 }), 1);
});

test("points and multiples print with their units", () => {
  assert.equal(formatStatValue(0.021, "points"), "+2.1 pp");
  assert.equal(formatStatValue(-0.004, "points"), "−0.4 pp");
  assert.equal(formatStatValue(4.86, "multiple"), "4.9×");
  assert.equal(formatAxisTick(0.02, "points", 0.04), "2.0 pp");
  assert.equal(formatAxisTick(3, "multiple", 4), "3.0×");
});
