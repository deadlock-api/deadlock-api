import assert from "node:assert/strict";
import { test } from "node:test";

import { approxPercentile, formatPercentile } from "./distribution-percentile";

const summary = (v: number[]) => ({
  avg: 0,
  std: 0,
  percentile1: v[0],
  percentile5: v[1],
  percentile10: v[2],
  percentile25: v[3],
  percentile50: v[4],
  percentile75: v[5],
  percentile90: v[6],
  percentile95: v[7],
  percentile99: v[8],
});

const kills = summary([0, 1, 2, 3, 5, 7, 9, 11, 15]);

test("a known percentile reads back exactly and a value between two is interpolated", () => {
  assert.equal(approxPercentile(kills, 5), 50);
  assert.equal(approxPercentile(kills, 4), 37.5);
  assert.equal(formatPercentile(approxPercentile(kills, 4)), "≈ P38");
});

test("values outside the known range say which side they fall on", () => {
  assert.equal(formatPercentile(approxPercentile(kills, -1)), "below P1");
  assert.equal(formatPercentile(approxPercentile(kills, 20)), "above P99");
});

test("a value shared by several percentiles takes the highest", () => {
  const mostlyZero = summary([0, 0, 0, 0, 0, 1, 2, 3, 5]);
  assert.equal(approxPercentile(mostlyZero, 0), 50);
  assert.equal(approxPercentile(mostlyZero, 0.5), 62.5);
});
