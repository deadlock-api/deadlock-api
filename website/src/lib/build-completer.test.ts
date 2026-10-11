import assert from "node:assert/strict";
import { test } from "node:test";

import { type CompleterChoice, completeBuild } from "./build-completer";

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
const base = {
  priceOf: (id: number) => price[id] ?? 0,
  categoryOf: (id: number) => category[id],
  componentsOf: (id: number) => (id === 5 ? [1] : []),
};

test("fills each stage within its souls, most bought first", () => {
  const added = completeBuild({
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
  const added = completeBuild({
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
  const added = completeBuild({
    ...base,
    stages: [{ column: 0, available: 10_000, slots: 1 }],
    choices: [choice(0, 5, 0.9), choice(0, 2, 0.8)],
    path: ["0:1"],
    focus: "balanced",
    goal: "popular",
  });
  assert.deepEqual(added, ["0:5"]);
});
