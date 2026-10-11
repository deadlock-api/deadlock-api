import assert from "node:assert/strict";
import { test } from "node:test";

import { describeIntent } from "./describe";
import { NO_FILTERS } from "./intent";

test("an intent's filters read as short labels, in the page's own order", () => {
  assert.deepEqual(
    describeIntent({
      ...NO_FILTERS,
      page: "hero_counters",
      heroes: ["Abrams"],
      enemy_heroes: ["Haze"],
      rank_min: "Eternus",
      mode: "ranked",
      time: "current_patch",
      region: "NAmerica",
    }),
    ["Abrams", "vs Haze", "Eternus+", "Ranked", "This patch", "North America"],
  );
});

test("a rank range reads as one label, and nothing narrowed reads as none", () => {
  assert.deepEqual(describeIntent({ ...NO_FILTERS, page: "x", rank_min: "Phantom", rank_max: "Eternus" }), [
    "Phantom to Eternus",
  ]);
  assert.deepEqual(describeIntent({ ...NO_FILTERS, page: "x", rank_max: "Oracle" }), ["Up to Oracle"]);
  assert.deepEqual(describeIntent({ ...NO_FILTERS, page: "x", item_tiers: [1, 3] }), ["Tier 1, 3"]);
  assert.deepEqual(describeIntent({ ...NO_FILTERS, page: "x" }), []);
});
