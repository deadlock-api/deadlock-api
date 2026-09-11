import assert from "node:assert/strict";
import { test } from "node:test";

import { benchmarkRankRange, compareBenchmark } from "./benchmarks";

test("benchmark rank range covers all six subtiers without exceeding API rank bounds", () => {
  assert.deepEqual(benchmarkRankRange(104), { tier: 10, min: 101, max: 106 });
  assert.deepEqual(benchmarkRankRange(116), { tier: 11, min: 111, max: 116 });
  for (const badge of [null, undefined, 0, 10, 17, 100, 117, 121, NaN, 104.5]) {
    assert.equal(benchmarkRankRange(badge), null);
  }
});

test("missing and nonfinite benchmark averages never become a zero comparison", () => {
  for (const missing of [undefined, null, NaN, Infinity, -Infinity]) {
    assert.equal(compareBenchmark(missing, 5), null);
    assert.equal(compareBenchmark(5, missing), null);
  }
});

test("benchmark differences retain direction and avoid dividing by a zero cohort average", () => {
  assert.deepEqual(compareBenchmark(12, 10), { player: 12, cohort: 10, delta: 2, relativeDelta: 0.2 });
  assert.deepEqual(compareBenchmark(4, 5), { player: 4, cohort: 5, delta: -1, relativeDelta: -0.2 });
  assert.deepEqual(compareBenchmark(5, 0), { player: 5, cohort: 0, delta: 5, relativeDelta: null });
  assert.equal(compareBenchmark(0, 0)?.relativeDelta, null);
});
