import assert from "node:assert/strict";
import { test } from "node:test";

import { winRateNoise } from "./wilson";

test("winRateNoise shrinks with the square root of the matches", () => {
  assert.ok(Math.abs(winRateNoise(100) - 0.098) < 0.001);
  assert.ok(Math.abs(winRateNoise(1000) - 0.031) < 0.001);
});

test("winRateNoise of two samples adds their variances", () => {
  assert.ok(Math.abs(winRateNoise(100, 100) - 0.1386) < 0.001);
  assert.ok(winRateNoise(100, 1000) > winRateNoise(100));
});

test("winRateNoise without matches treats any difference as noise", () => {
  assert.equal(winRateNoise(0), 1);
  assert.equal(winRateNoise(50, 0), 1);
});
