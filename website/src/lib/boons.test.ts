import assert from "node:assert/strict";
import { test } from "node:test";

import type { Hero } from "deadlock_api_client";

import { boonCards, boonLevelsFrom, boonOptions, requiredBoon } from "./boons";

// The table as the game has it (2026-11): unlocks at boons 1, 3, 5 and 8, an ability point at every other boon.
const SOULS = [
  0, 200, 500, 900, 1400, 2000, 2600, 3200, 3900, 4600, 5300, 6000, 6800, 7600, 8400, 9200, 10100, 11000, 11900, 12800,
  13800, 14900, 16100, 17400, 18900, 20600, 22500, 24600, 26900, 29400, 32100, 35000, 38100, 41400, 44900, 48600,
];
const UNLOCK_BOONS = new Set([1, 3, 5, 8]);
const levelInfo = Object.fromEntries(
  SOULS.map((souls, index) => [
    String(index + 1),
    { required_gold: souls, bonus_currencies: [UNLOCK_BOONS.has(index + 1) ? "EAbilityUnlocks" : "EAbilityPoints"] },
  ]),
) as Hero["level_info"];
const levels = boonLevelsFrom(levelInfo);

test("boonLevelsFrom sums the ability points and unlocks", () => {
  assert.equal(levels.length, 36);
  assert.deepEqual(levels[7], { boon: 8, souls: 3200, abilityPoints: 4, abilityUnlocks: 4 });
  assert.deepEqual(levels.at(-1), { boon: 36, souls: 48600, abilityPoints: 32, abilityUnlocks: 4 });
});

test("requiredBoon finds the first boon with enough points and unlocks", () => {
  // 1 + 8 + 8 + 0 = 17 points, four unlocks.
  assert.equal(requiredBoon([1, 3, 3, 0], levels)?.souls, 13800);
  assert.equal(requiredBoon([0, null, null, null], levels)?.souls, 0);
  assert.equal(requiredBoon([1, 0, null, null], levels)?.souls, 500);
  assert.equal(requiredBoon([0, 0, 0, 0], levels)?.souls, 3200);
  assert.equal(requiredBoon([3, 3, 3, 3], levels)?.souls, 48600);
});

test("boonCards holds every set of tiers once, without the all-locked one", () => {
  const cards = boonCards(levels);
  assert.equal(cards.length, 69);
  assert.equal(new Set(cards.map((card) => card.id)).size, 69);
  for (const card of cards) {
    assert.equal(card.slots.length, 4);
    assert.equal(requiredBoon(card.slots, levels), card.level);
  }
});

test("boonOptions offers the answer among the nearest boons, by souls", () => {
  const answer = levels[20];
  const options = boonOptions(answer, levels, () => 0);
  assert.equal(options.length, 4);
  assert.ok(options.includes(answer));
  assert.deepEqual(
    options.map((level) => level.souls),
    options.map((level) => level.souls).toSorted((a, b) => a - b),
  );
  assert.equal(boonOptions(levels[0], levels, () => 0).length, 4);
});
