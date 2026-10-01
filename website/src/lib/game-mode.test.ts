import assert from "node:assert/strict";
import { test } from "node:test";

import { getEffectiveRankRange, hasSoulEconomy } from "./game-mode";

test("a backwards rank pair from the URL is put in order", () => {
  assert.deepEqual(getEffectiveRankRange("normal_all", 116, 91), { effectiveMinRankId: 91, effectiveMaxRankId: 116 });
  assert.deepEqual(getEffectiveRankRange("normal_all", 91, 116), { effectiveMinRankId: 91, effectiveMaxRankId: 116 });
});

test("modes without ranks drop the range", () => {
  assert.deepEqual(getEffectiveRankRange("street_brawl", 116, 91), {
    effectiveMinRankId: undefined,
    effectiveMaxRankId: undefined,
  });
});

test("only Street Brawl lacks a soul economy", () => {
  assert.equal(hasSoulEconomy("normal"), true);
  assert.equal(hasSoulEconomy(undefined), true);
  assert.equal(hasSoulEconomy("street_brawl"), false);
});
