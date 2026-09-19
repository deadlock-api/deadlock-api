import assert from "node:assert/strict";
import { test } from "node:test";

import { formatCompactAxisTick, niceTicks } from "./chart-axis";

test("small changes stay distinct on both percentage and compact count axes", () => {
  for (const [min, max] of [
    [50.01, 50.09],
    [10001, 10009],
    [1000001, 1000009],
    [0.00001, 0.00009],
  ]) {
    const ticks = niceTicks(min, max, 8);
    const labels = ticks.map((tick) => formatCompactAxisTick(tick, ticks[1] - ticks[0]));
    assert.equal(new Set(labels).size, ticks.length, `${min}–${max}: ${labels.join(", ")}`);
  }
});

test("compact axes avoid unnecessary decimals and handle flat series", () => {
  assert.equal(formatCompactAxisTick(10000, 1000), "10K");
  assert.equal(formatCompactAxisTick(12500, 500), "12.5K");
  assert.equal(formatCompactAxisTick(50, Number.NaN), "50");
  assert.equal(formatCompactAxisTick(0, 0), "0");
});
