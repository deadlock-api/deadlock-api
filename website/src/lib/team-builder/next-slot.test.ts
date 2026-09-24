import assert from "node:assert/strict";
import { test } from "node:test";

import type { Draft } from "./analysis";
import { nextEmptySlot } from "./next-slot";

const draft = (ally: (number | null)[], enemy: (number | null)[]): Draft => ({ gameMode: "normal", ally, enemy });

test("after a pick the picker moves to the next empty slot of the same team", () => {
  const empty = [null, null, null, null, null, null];
  assert.deepEqual(nextEmptySlot(draft(empty, empty), "ally", 0), { side: "ally", slot: 1 });
  assert.deepEqual(nextEmptySlot(draft([1, 2, null, 4, null, null], empty), "ally", 2), { side: "ally", slot: 4 });
});

test("it wraps to an earlier empty slot, then the other team, and stops when the board is full", () => {
  const full = [1, 2, 3, 4, 5, 6];
  assert.deepEqual(nextEmptySlot(draft([null, 2, 3, 4, 5, null], full), "ally", 5), { side: "ally", slot: 0 });
  assert.deepEqual(nextEmptySlot(draft([1, 2, 3, 4, 5, null], [7, null, 9, 10, 11, 12]), "ally", 5), {
    side: "enemy",
    slot: 1,
  });
  assert.equal(nextEmptySlot(draft(full, [7, 8, 9, 10, 11, null]), "enemy", 5), null);
});
