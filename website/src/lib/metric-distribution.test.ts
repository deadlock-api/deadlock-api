import assert from "node:assert/strict";
import { test } from "node:test";

import type { MetricValues } from "deadlock_api_client";

import { completeMetrics } from "./metric-distribution";

const values = (v: number | null): MetricValues => ({
  avg: v,
  std: v,
  percentile1: v,
  percentile5: v,
  percentile10: v,
  percentile25: v,
  percentile50: v,
  percentile75: v,
  percentile90: v,
  percentile95: v,
  percentile99: v,
});

test("completeMetrics keeps metrics with every value and drops ones with a null", () => {
  const partial = { ...values(3), percentile99: null };
  const metrics = completeMetrics({ kills: values(3), first_permanent_buff_time_s: values(null), deaths: partial });
  assert.deepEqual(Object.keys(metrics), ["kills"]);
  assert.equal(metrics.kills.percentile50, 3);
});
