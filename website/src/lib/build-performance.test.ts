import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BUILD_METRICS,
  type BuildPerformanceTotals,
  metricDelta,
  PERFORMANCE_TOTAL_KEYS,
  poolPerformance,
} from "./build-performance";

function totals(matches: number, values: Partial<BuildPerformanceTotals> = {}): BuildPerformanceTotals {
  const row = { matches, avg_average_badge: 0 } as BuildPerformanceTotals;
  for (const key of PERFORMANCE_TOTAL_KEYS) row[key] = 0;
  return { ...row, ...values };
}

const metric = (key: string) => BUILD_METRICS.find((m) => m.key === key)!;

test("pooling adds the totals and weighs the badge by matches, leaving out builds without one", () => {
  const pooled = poolPerformance([
    totals(10, { total_kills: 50, avg_average_badge: 80 }),
    totals(30, { total_kills: 30, avg_average_badge: 40 }),
    totals(60, { total_kills: 20 }),
  ])!;
  assert.equal(pooled.matches, 100);
  assert.equal(pooled.total_kills, 100);
  assert.equal(pooled.avg_average_badge, (80 * 10 + 40 * 30) / 40);
  assert.equal(poolPerformance([]), null);
});

test("metrics are per match, per minute or rates, and null where there is nothing to divide by", () => {
  const t = totals(4, {
    total_kills: 20,
    total_deaths: 0,
    total_assists: 8,
    total_net_worth: 120_000,
    total_duration_s: 4 * 30 * 60,
    total_shots_hit: 300,
    total_shots_missed: 700,
  });
  assert.equal(metric("kills").value(t), 5);
  assert.equal(metric("kda").value(t), 28);
  assert.equal(metric("soulsPerMin").value(t), 1000);
  assert.equal(metric("accuracy").value(t), 0.3);
  assert.equal(metric("critRate").value(t), null);
  assert.equal(metric("kills").value(totals(0)), null);
});

test("a difference is relative for amounts and in points for rates", () => {
  assert.ok(Math.abs(metricDelta(metric("kills"), 6, 5)! - 0.2) < 1e-9);
  assert.ok(Math.abs(metricDelta(metric("accuracy"), 0.32, 0.3)! - 0.02) < 1e-9);
  assert.equal(metricDelta(metric("kills"), 6, 0), null);
  assert.equal(metricDelta(metric("kills"), null, 5), null);
});
