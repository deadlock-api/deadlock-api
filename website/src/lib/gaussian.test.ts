import assert from "node:assert/strict";
import { test } from "node:test";

import { buildGaussianComparison } from "./gaussian";

test("Gaussian fit peaks at the mean, is symmetric and integrates to approximately one", () => {
  const curve = buildGaussianComparison({ avg: 10, std: 2 });
  assert.ok(curve);
  assert.equal(curve.min, 2);
  assert.equal(curve.max, 18);
  const peak = curve.points.find((point) => point.x === 10);
  assert.ok(peak?.player != null);
  assert.ok(Math.abs(peak.player - 1 / (2 * Math.sqrt(2 * Math.PI))) < 1e-10);
  const left = curve.points.find((point) => point.x === 8);
  const right = curve.points.find((point) => point.x === 12);
  assert.equal(left?.player, right?.player);
  const area = curve.points.slice(1).reduce((sum, point, index) => {
    const previous = curve.points[index];
    return sum + ((point.x - previous.x) * ((point.player ?? 0) + (previous.player ?? 0))) / 2;
  }, 0);
  assert.ok(Math.abs(area - 1) < 0.001);
});

test("comparison keeps a distant player mean and narrow distribution on the same scale", () => {
  const curve = buildGaussianComparison({ avg: 50, std: 0.1 }, { avg: 5, std: 3 });
  assert.ok(curve);
  assert.ok(curve.max > 50);
  assert.equal(curve.min, 0);
  assert.ok(curve.points.some((point) => point.x === 50 && (point.player ?? 0) > 3));
  assert.ok(curve.points.some((point) => point.x === 5 && (point.cohort ?? 0) > 0));
  assert.ok(
    curve.points.every(
      (point) => Number.isFinite(point.x) && Number.isFinite(point.player) && Number.isFinite(point.cohort),
    ),
  );
});

test("percentage curves are cropped to valid metric values", () => {
  const curve = buildGaussianComparison({ avg: 0.9, std: 0.2 }, { avg: 0.3, std: 0.2 }, 1);
  assert.ok(curve);
  assert.equal(curve.min, 0);
  assert.equal(curve.max, 1);
  assert.ok(curve.points.every((point) => point.x >= 0 && point.x <= 1));
});

test("zero or missing spread never becomes a fabricated Gaussian", () => {
  for (const std of [0, -1, null, undefined, NaN, Infinity]) {
    const curve = buildGaussianComparison({ avg: 0, std }, { avg: 4, std: 1 });
    assert.ok(curve);
    assert.ok(curve.points.every((point) => point.player === null));
    assert.equal(curve.hasSpread, true);
  }
  assert.equal(buildGaussianComparison({ avg: 0, std: 0 }, { avg: 0, std: 0 })?.hasSpread, false);
  assert.equal(buildGaussianComparison(undefined, { avg: NaN, std: 1 }), null);
});
