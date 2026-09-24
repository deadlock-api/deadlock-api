import assert from "node:assert/strict";
import { test } from "node:test";

import { chosenIds, countSummary, filterByName, moveInGrid, moveInRows, rowLengths, toggleInList } from "./picker";

test("a search keeps the choices whose name contains it, in order", () => {
  const choices = [
    { id: 1, name: "Extra Charge" },
    { id: 2, name: "Mystic Burst" },
    { id: 3, name: "Extra Regen" },
  ];
  assert.deepEqual(
    filterByName(choices, " extra ").map((c) => c.id),
    [1, 3],
  );
  assert.equal(filterByName(choices, "  "), choices);
});

test("a list press adds at the end or takes out", () => {
  assert.deepEqual(toggleInList([], 4), [4]);
  assert.deepEqual(toggleInList([4, 5], 4), [5]);
});

test("rows fill five at a time with a ragged last row", () => {
  assert.deepEqual(rowLengths(12), [5, 5, 2]);
  assert.deepEqual(rowLengths(5), [5]);
  assert.deepEqual(rowLengths(0), []);
});

test("moveInGrid is moveInRows over full rows", () => {
  for (const key of ["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "Home", "End", "PageDown", "PageUp"]) {
    for (let i = 0; i < 23; i++) assert.equal(moveInGrid(i, key, 23), moveInRows(i, key, [5, 5, 5, 5, 3]));
  }
});

test("arrows follow ragged rows of groups: a tier ending on a short row", () => {
  // Two groups drawn as rows [5, 2] and [5, 1]: tiles 0-4, 5-6 | 7-11, 12.
  const sizes = [5, 2, 5, 1];
  assert.equal(moveInRows(3, "ArrowDown", sizes), 6, "down onto a short row lands on its last tile");
  assert.equal(moveInRows(6, "ArrowDown", sizes), 8, "and keeps its column into the next group");
  assert.equal(moveInRows(9, "ArrowDown", sizes), 12);
  assert.equal(moveInRows(12, "ArrowDown", sizes), 12, "the last row stays");
  assert.equal(moveInRows(10, "ArrowUp", sizes), 6);
  assert.equal(moveInRows(1, "ArrowUp", sizes), "exit-up");
  assert.equal(moveInRows(6, "ArrowRight", sizes), 7, "right runs on across the end of a row");
  assert.equal(moveInRows(7, "ArrowLeft", sizes), 6);
  assert.equal(moveInRows(8, "Home", sizes), 7);
  assert.equal(moveInRows(5, "End", sizes), 6);
  assert.equal(moveInRows(8, "End", sizes, { jump: true }), 12);
  assert.equal(moveInRows(2, "PageDown", sizes), 12);
  assert.equal(moveInRows(12, "PageUp", sizes), 0);
  assert.equal(moveInRows(0, "Tab", sizes), null);
  assert.equal(moveInRows(0, "ArrowDown", []), null);
});

test("chosen ids of every mode", () => {
  assert.deepEqual([...chosenIds(null)], []);
  assert.deepEqual([...chosenIds(3)], [3]);
  assert.deepEqual([...chosenIds([1, 2])], [1, 2]);
  assert.deepEqual([...chosenIds(new Map([[7, "excluded"]]))], [7]);
});

test("a count reads with its noun", () => {
  assert.equal(countSummary(0, { one: "item", other: "items" }), "Any");
  assert.equal(countSummary(0, { one: "item", other: "items", empty: "None" }), "None");
  assert.equal(countSummary(1, { one: "item", other: "items" }), "1 item");
  assert.equal(countSummary(3, { one: "item", other: "items" }), "3 items");
});
