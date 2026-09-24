import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveVisibleHeroIds } from "./hero-trends";

test("nothing chosen shows hero 2, or the first hero of a roster without it", () => {
  assert.deepEqual(resolveVisibleHeroIds([1, 2, 3], null), [2]);
  assert.deepEqual(resolveVisibleHeroIds([7, 3], null), [7]);
  assert.deepEqual(resolveVisibleHeroIds([], null), []);
});

test("a chosen selection keeps its known heroes and drops unknown ids", () => {
  assert.deepEqual(resolveVisibleHeroIds([1, 2, 3], [3, 999, 1, 3]), [3, 1]);
});

test("a selection of only unknown ids falls back to the default", () => {
  assert.deepEqual(resolveVisibleHeroIds([1, 2, 3], [999]), [2]);
});

test("an explicit empty selection stays empty", () => {
  assert.deepEqual(resolveVisibleHeroIds([1, 2, 3], []), []);
});
