import assert from "node:assert/strict";
import { test } from "node:test";

import { type CompleterChoice, type CompleterInput, completeBuild } from "./build-completer";

const choice = (column: number, itemId: number, pickRate: number, score = 0.5): CompleterChoice => ({
  key: `${column}:${itemId}`,
  column,
  itemId,
  pickRate,
  score,
});
const price: Record<number, number> = { 1: 800, 2: 800, 3: 1600, 4: 3200, 5: 3200, 6: 800 };
const category: Record<number, string> = {
  1: "weapon",
  2: "spirit",
  3: "weapon",
  4: "spirit",
  5: "weapon",
  6: "vitality",
};
// The keys a completion adds, without its sales.
const keys = (input: CompleterInput) => completeBuild(input).map((step) => step.key);
const base = {
  priceOf: (id: number) => price[id] ?? 0,
  categoryOf: (id: number) => category[id],
  componentsOf: (id: number) => (id === 5 ? [1] : []),
};

test("fills each stage within its souls, most bought first", () => {
  const added = keys({
    ...base,
    stages: [
      { column: 0, available: 1600, slots: 9 },
      { column: 1, available: 5000, slots: 9 },
    ],
    choices: [choice(0, 1, 0.8), choice(0, 2, 0.7), choice(0, 3, 0.6), choice(1, 4, 0.5)],
    path: [],
    focus: "balanced",
    goal: "popular",
  });
  // 800 + 800 fills 0-9m's 1,600; Extra 1,600 would not fit. 9-20m adds the 3,200 item: 4,800 of 5,000.
  assert.deepEqual(added, ["0:1", "0:2", "1:4"]);
});

test("the focus category goes first and picks stay", () => {
  const added = keys({
    ...base,
    stages: [{ column: 0, available: 1600, slots: 9 }],
    choices: [choice(0, 1, 0.8), choice(0, 2, 0.7), choice(0, 6, 0.6)],
    path: ["0:1"],
    focus: "vitality",
    goal: "popular",
  });
  assert.deepEqual(added, ["0:6"]);
});

test("slots limit the build, and an upgrade frees its component's slot", () => {
  const added = keys({
    ...base,
    stages: [{ column: 0, available: 10_000, slots: 1 }],
    choices: [choice(0, 5, 0.9), choice(0, 2, 0.8)],
    path: ["0:1"],
    focus: "balanced",
    goal: "popular",
  });
  assert.deepEqual(added, ["0:5"]);
});

test("the confident goal ranks a rate from many games over a perfect one from a few", () => {
  const stage = { column: 0, available: 800, slots: 9 };
  const few = { ...choice(0, 1, 0.1, 0.62), lowerBound: 0.66 };
  const many = { ...choice(0, 2, 0.6, 0.58), lowerBound: 0.57 };
  const fewer = { ...choice(0, 1, 0.1, 0.62), lowerBound: 0.44 };
  assert.deepEqual(
    keys({ ...base, stages: [stage], choices: [few, many], path: [], focus: "balanced", goal: "winning" }),
    ["0:1"],
  );
  assert.deepEqual(
    keys({ ...base, stages: [stage], choices: [fewer, many], path: [], focus: "balanced", goal: "confident" }),
    ["0:2"],
  );
});

test("with the slots full, a cheaper item most buyers sell makes room", () => {
  const steps = completeBuild({
    ...base,
    stages: [
      { column: 0, available: 1600, slots: 2 },
      { column: 1, available: 4500, slots: 2 },
    ],
    choices: [choice(1, 4, 0.7)],
    path: ["0:2", "0:6"],
    sellShareOf: (id) => ({ 2: 0.6, 6: 0.9 })[id],
    focus: "balanced",
    goal: "popular",
  });
  // 1,600 spent and 400 back from the sale: the 3,200 item fits 4,500 only with it, and in the slot it frees.
  assert.deepEqual(steps, [{ key: "1:4", sells: "0:6" }]);
});

test("no sale of an item its buyers keep, or of a component the build upgrades later", () => {
  const input = {
    ...base,
    stages: [
      { column: 0, available: 800, slots: 1 },
      { column: 1, available: 10_000, slots: 1 },
    ],
    choices: [choice(1, 4, 0.7)],
    focus: "balanced",
    goal: "popular",
  } as const;
  assert.deepEqual(keys({ ...input, path: ["0:1"], sellShareOf: () => 0.2 }), []);
  assert.deepEqual(keys({ ...input, path: ["0:1", "2:5"], sellShareOf: () => 0.9 }), []);
});

test("a planned sale frees its slot and refunds", () => {
  const added = keys({
    ...base,
    stages: [
      { column: 0, available: 800, slots: 1 },
      { column: 1, available: 3600, slots: 1 },
    ],
    choices: [choice(1, 4, 0.7)],
    path: ["0:1"],
    sells: new Map([["0:1", 1]]),
    focus: "balanced",
    goal: "popular",
  });
  // 800 spent, 400 back: 3,200 fits 3,600.
  assert.deepEqual(added, ["1:4"]);
});
