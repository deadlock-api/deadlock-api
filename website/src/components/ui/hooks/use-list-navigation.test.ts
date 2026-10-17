import assert from "node:assert/strict";
import { test } from "node:test";

import { nextListIndex } from "./use-list-navigation";

test("the arrow keys step and stop at the ends", () => {
  assert.equal(nextListIndex("ArrowDown", 3, 10), 4);
  assert.equal(nextListIndex("ArrowDown", 9, 10), 9);
  assert.equal(nextListIndex("ArrowUp", 0, 10), 0);
  assert.equal(nextListIndex("ArrowUp", 5, 10), 4);
});

test("page keys jump a page, Home and End go to the ends", () => {
  assert.equal(nextListIndex("PageDown", 2, 30, 10), 12);
  assert.equal(nextListIndex("PageDown", 25, 30, 10), 29);
  assert.equal(nextListIndex("PageUp", 5, 30, 10), 0);
  assert.equal(nextListIndex("Home", 7, 30), 0);
  assert.equal(nextListIndex("End", 7, 30), 29);
});

test("without a selection the keys start at the edge they point to; other keys do nothing", () => {
  assert.equal(nextListIndex("ArrowDown", -1, 5), 0);
  assert.equal(nextListIndex("ArrowUp", -1, 5), 4);
  assert.equal(nextListIndex("Enter", 2, 5), null);
  assert.equal(nextListIndex("ArrowDown", 0, 0), null);
});
