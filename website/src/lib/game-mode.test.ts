import assert from "node:assert/strict";
import { test } from "node:test";

import { getEffectiveRankRange, hasSoulEconomy, modeFromParams } from "./game-mode";

test("a backwards rank pair from the URL is put in order", () => {
  assert.deepEqual(getEffectiveRankRange("normal_ranked", 116, 91), {
    effectiveMinRankId: 91,
    effectiveMaxRankId: 116,
  });
  assert.deepEqual(getEffectiveRankRange("normal_ranked", 91, 116), {
    effectiveMinRankId: 91,
    effectiveMaxRankId: 116,
  });
});

test("modes without ranks drop the range", () => {
  assert.deepEqual(getEffectiveRankRange("street_brawl", 116, 91), {
    effectiveMinRankId: undefined,
    effectiveMaxRankId: undefined,
  });
  assert.deepEqual(getEffectiveRankRange("normal_unranked", 91, 116), {
    effectiveMinRankId: undefined,
    effectiveMaxRankId: undefined,
  });
});

test("All keeps its unranked matches: a rank range would drop every one of them", () => {
  assert.deepEqual(getEffectiveRankRange("normal_all", 91, 116), {
    effectiveMinRankId: undefined,
    effectiveMaxRankId: undefined,
  });
});

test("the game_mode / match_mode params name one mode, All among them", () => {
  assert.equal(modeFromParams("normal", "ranked,unranked"), "normal_all");
  assert.equal(modeFromParams("normal", "ranked"), "normal_ranked");
  assert.equal(modeFromParams("normal", "unranked"), "normal_unranked");
  assert.equal(modeFromParams("street_brawl", "ranked"), "street_brawl");
});

test("only Street Brawl lacks a soul economy", () => {
  assert.equal(hasSoulEconomy("normal"), true);
  assert.equal(hasSoulEconomy(undefined), true);
  assert.equal(hasSoulEconomy("street_brawl"), false);
});
