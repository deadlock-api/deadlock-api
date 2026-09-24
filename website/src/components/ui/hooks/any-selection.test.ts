import assert from "node:assert/strict";
import { test } from "node:test";

import { anyPressed, anyValue } from "./any-selection";

const ALL = [1, 2, 3, 4];

test("everything shows as nothing pressed, and a first press picks that choice", () => {
  assert.deepEqual(anyPressed(ALL, ALL), []);
  assert.deepEqual(anyValue(ALL, [3]), [3]);
  assert.deepEqual(anyPressed(ALL, [3]), [3]);
});

test("more presses add; none or all pressed is every choice", () => {
  assert.deepEqual(anyValue(ALL, [4, 3]), [3, 4]);
  assert.deepEqual(anyValue(ALL, []), ALL);
  assert.deepEqual(anyPressed(ALL, anyValue(ALL, [1, 2, 3, 4])), []);
});
