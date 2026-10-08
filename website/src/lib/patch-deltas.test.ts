import assert from "node:assert/strict";
import { test } from "node:test";

import { compareTallies, soulsPerMinute, statDelta, tallyBy, topMovers, weightedAverage } from "./patch-deltas";

test("statDelta: rates change in points, other stats relative", () => {
  assert.equal(statDelta("percent", 0.53, 0.5), 0.03);
  assert.equal(statDelta("duration", 1800, 1500), 0.2);
  assert.equal(statDelta("integer", 5, 0), null);
  assert.equal(statDelta("percent", null, 0.5), null);
});

const row = (hero_id: number, bucket: number, wins: number, matches: number) => ({ hero_id, bucket, wins, matches });

test("tallyBy sums the rank buckets inside a range", () => {
  const rows = [row(1, 11, 5, 10), row(1, 95, 30, 50), row(1, 116, 10, 20), row(2, 101, 1, 2)];
  const phantomUp = tallyBy(rows, (r) => r.hero_id, { min: 91, max: 116 });
  assert.deepEqual(phantomUp.byId.get(1), { wins: 40, matches: 70 });
  assert.equal(phantomUp.total, 72);
  assert.deepEqual(tallyBy(rows, (r) => r.hero_id).byId.get(1), { wins: 45, matches: 80 });
});

test("compareTallies: deltas, sample floor and new entities", () => {
  const before = tallyBy([row(1, 100, 50, 100), row(2, 100, 40, 100), row(4, 100, 1, 5)], (r) => r.hero_id);
  const after = tallyBy(
    [row(1, 100, 60, 100), row(2, 100, 45, 100), row(3, 100, 55, 100), row(4, 100, 60, 100), row(5, 100, 1, 2)],
    (r) => r.hero_id,
  );
  const changes = new Map(
    compareTallies(before, after, { minMatches: 10, pickRateMultiplier: 12 }).map((c) => [c.id, c]),
  );
  assert.equal(changes.get(1)?.winRateDelta, 0.1);
  assert.equal(changes.get(1)?.pickRate, (12 * 100) / 402);
  assert.equal(changes.get(1)?.pickRateDelta, Math.round(((12 * 100) / 402 - (12 * 100) / 205) * 1000) / 1000);
  assert.equal(changes.get(3)?.isNew, true);
  assert.equal(changes.get(3)?.winRateDelta, null);
  // Too rare before the patch: listed, but without a delta.
  assert.equal(changes.get(4)?.isNew, false);
  assert.equal(changes.get(4)?.winRateDelta, null);
  // Too rare after the patch: left out.
  assert.equal(changes.has(5), false);
});

test("compareTallies keeps only included ids but counts all towards the base", () => {
  const before = tallyBy([row(1, 0, 5, 10), row(9, 0, 5, 10)], (r) => r.hero_id);
  const after = tallyBy([row(1, 0, 5, 10), row(9, 0, 5, 30)], (r) => r.hero_id);
  const changes = compareTallies(before, after, { minMatches: 1, pickRateMultiplier: 1, include: (id) => id === 1 });
  assert.equal(changes.length, 1);
  assert.equal(changes[0].pickRate, 0.25);
});

test("topMovers splits gains and drops, biggest first", () => {
  const change = (id: number, winRateDelta: number | null) => ({
    id,
    matches: 1,
    prevMatches: 1,
    winRate: 0.5,
    pickRate: 0.1,
    winRateDelta,
    pickRateDelta: null,
    isNew: false,
  });
  const { gains, drops } = topMovers(
    [change(1, 0.01), change(2, 0.05), change(3, -0.02), change(4, -0.04), change(5, null), change(6, 0)],
    (c) => c.winRateDelta,
    1,
  );
  assert.deepEqual(
    gains.map((c) => c.id),
    [2],
  );
  assert.deepEqual(
    drops.map((c) => c.id),
    [4],
  );
});

test("weightedAverage weights buckets by matches", () => {
  const rows = [
    { bucket: 11, total_matches: 100, avg_duration_s: 1000 },
    { bucket: 95, total_matches: 300, avg_duration_s: 2000 },
    { bucket: 100, total_matches: 100, avg_duration_s: 1000 },
  ];
  assert.equal(
    weightedAverage(rows, (r) => r.avg_duration_s, { min: 91, max: 116 }),
    1750,
  );
  assert.equal(
    weightedAverage(rows, (r) => r.avg_duration_s, { min: 111, max: 116 }),
    null,
  );
});

test("soulsPerMinute", () => {
  assert.equal(soulsPerMinute(30_000, 1800), 1000);
  assert.equal(soulsPerMinute(30_000, 0), null);
});
