import assert from "node:assert/strict";
import { test } from "node:test";

import {
  cycleTriState,
  filterHeroes,
  moveInGrid,
  multipleSummary,
  toggleHero,
  toggleTriState,
  triStateSummary,
} from "./hero-picker";

const heroes = [
  { id: 1, name: "Abrams" },
  { id: 2, name: "Bebop" },
  { id: 3, name: "Kelvin" },
  { id: 4, name: "Mo & Krill" },
];

test("a search keeps the heroes whose name contains it, ignoring case and outer space, in order", () => {
  assert.deepEqual(
    filterHeroes(heroes, "  KEL ").map((h) => h.id),
    [3],
  );
  assert.deepEqual(
    filterHeroes(heroes, "b").map((h) => h.id),
    [1, 2],
  );
  assert.deepEqual(
    filterHeroes(heroes, "& k").map((h) => h.id),
    [4],
  );
  assert.equal(filterHeroes(heroes, ""), heroes);
  assert.deepEqual(filterHeroes(heroes, "zzz"), []);
});

test("tri-state cycles neither, included, excluded, neither", () => {
  assert.equal(cycleTriState(undefined), "included");
  assert.equal(cycleTriState("included"), "excluded");
  assert.equal(cycleTriState("excluded"), undefined);
});

test("toggling a tri-state hero leaves the old map alone and drops the key at neither", () => {
  const start = new Map<number, "included" | "excluded">([[2, "excluded"]]);
  const once = toggleTriState(start, 1);
  assert.deepEqual(
    [...once],
    [
      [2, "excluded"],
      [1, "included"],
    ],
  );
  assert.deepEqual([...start], [[2, "excluded"]]);
  const cleared = toggleTriState(start, 2);
  assert.equal(cleared.has(2), false);
  assert.equal(toggleTriState(toggleTriState(toggleTriState(new Map(), 5), 5), 5).size, 0);
});

test("a multiple press adds a hero at the end or takes it out", () => {
  assert.deepEqual(toggleHero([1, 2], 3), [1, 2, 3]);
  assert.deepEqual(toggleHero([1, 2, 3], 2), [1, 3]);
});

test("summaries read the way the trigger shows them", () => {
  assert.equal(triStateSummary(new Map()), "Any");
  assert.equal(
    triStateSummary(
      new Map([
        [1, "included"],
        [2, "included"],
        [3, "excluded"],
      ]),
    ),
    "+2 / -1",
  );
  assert.equal(triStateSummary(new Map([[3, "excluded"]])), "-1");
  assert.equal(multipleSummary(0), "Any");
  assert.equal(multipleSummary(0, "None"), "None");
  assert.equal(multipleSummary(1), "1 hero");
  assert.equal(multipleSummary(4), "4 heroes");
});

test("arrows move through a grid of five, wrapping sideways and stopping at the ends", () => {
  // 12 tiles: rows 0-4, 5-9, 10-11.
  assert.equal(moveInGrid(0, "ArrowRight", 12), 1);
  assert.equal(moveInGrid(4, "ArrowRight", 12), 5);
  assert.equal(moveInGrid(11, "ArrowRight", 12), 11);
  assert.equal(moveInGrid(0, "ArrowLeft", 12), 0);
  assert.equal(moveInGrid(5, "ArrowLeft", 12), 4);
  assert.equal(moveInGrid(2, "ArrowDown", 12), 7);
  // Below 8 there is no tile; the ragged last row catches it at its last tile.
  assert.equal(moveInGrid(8, "ArrowDown", 12), 11);
  assert.equal(moveInGrid(11, "ArrowDown", 12), 11);
  assert.equal(moveInGrid(7, "ArrowUp", 12), 2);
  assert.equal(moveInGrid(2, "ArrowUp", 12), "exit-up");
  assert.equal(moveInGrid(7, "Home", 12), 5);
  assert.equal(moveInGrid(7, "End", 12), 9);
  assert.equal(moveInGrid(10, "End", 12), 11);
  assert.equal(moveInGrid(7, "Home", 12, { jump: true }), 0);
  assert.equal(moveInGrid(7, "End", 12, { jump: true }), 11);
  assert.equal(moveInGrid(0, "PageDown", 12), 11);
  assert.equal(moveInGrid(7, "Enter", 12), null);
  assert.equal(moveInGrid(0, "ArrowDown", 0), null);
});
