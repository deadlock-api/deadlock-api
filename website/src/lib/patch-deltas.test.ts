import assert from "node:assert/strict";
import { test } from "node:test";

import {
  bandGap,
  compareTallies,
  daysDiffer,
  isSignificant,
  significantStatChanges,
  soulsPerMinute,
  statDelta,
  tallyBy,
  topMovers,
} from "./patch-deltas";

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

test("topMovers splits significant gains and drops, biggest first", () => {
  const change = (id: number, winRateDelta: number | null, winRateSE = 0.005) => ({
    id,
    matches: 1,
    prevMatches: 1,
    winRate: 0.5,
    pickRate: 0.1,
    winRateDelta,
    pickRateDelta: null,
    winRateSE,
    pickRateSE: null,
    isNew: false,
  });
  const { gains, drops } = topMovers(
    // 3 is a big change within its noise (SE 0.02); 5 has none; 6 is zero.
    [change(1, 0.02), change(2, 0.05), change(3, 0.04, 0.02), change(4, -0.04), change(5, null), change(6, 0)],
    (c) => c.winRateDelta,
    (c) => c.winRateSE,
    5,
  );
  assert.deepEqual(
    gains.map((c) => c.id),
    [2, 1],
  );
  assert.deepEqual(
    drops.map((c) => c.id),
    [4],
  );
});

test("isSignificant at 99%", () => {
  assert.equal(isSignificant(0.026, 0.01), true);
  assert.equal(isSignificant(0.025, 0.01), false);
  assert.equal(isSignificant(null, 0.01), false);
  assert.equal(isSignificant(0.1, null), false);
});

test("compareTallies gives each delta its standard error", () => {
  const before = tallyBy([row(1, 0, 500, 1000)], (r) => r.hero_id);
  const after = tallyBy([row(1, 0, 600, 1000)], (r) => r.hero_id);
  const [change] = compareTallies(before, after, { minMatches: 1, pickRateMultiplier: 1 });
  assert.equal(
    Math.round(change.winRateSE! * 10000) / 10000,
    Math.round(Math.sqrt(0.24 / 1000 + 0.25 / 1000) * 10000) / 10000,
  );
  // A share of 100%: no spread at all.
  assert.equal(change.pickRateSE, 0);
});

test("bandGap: a significant gap between two bands, or null", () => {
  const m = (delta: number, se = 0.005) => ({ delta, se });
  assert.equal(Math.round(bandGap([m(0.01), m(0), m(-0.02), m(0.05)], 0, 2)! * 1000) / 1000, 0.03);
  // Within the noise of the two bands.
  assert.equal(bandGap([m(0.01, 0.02), null, m(-0.02, 0.02)], 0, 2), null);
  assert.equal(bandGap([null, m(0), m(-0.02)], 0, 2), null);
});

test("daysDiffer: a shift beyond the day-to-day swing", () => {
  assert.equal(daysDiffer([100, 102, 98, 101, 99], [120, 118, 122, 121]), true);
  assert.equal(daysDiffer([100, 120, 80, 110, 90], [104, 96, 110]), false);
  assert.equal(daysDiffer([100], [120, 121]), false);
});

test("significantStatChanges: big, beyond the daily swing, biggest first", () => {
  const stats = [
    { key: "a", format: "duration" },
    { key: "b", format: "decimal1" },
    { key: "c", format: "percent" },
    { key: "d", format: "duration" },
  ] as const;
  const day = (a: number, b: number, c: number, d: number) => ({ total_matches: 100, a, b, c, d });
  const before = [day(1000, 10, 0.05, 1000), day(1010, 10.1, 0.051, 900), day(990, 9.9, 0.049, 1100)];
  // a: +10%, steady. b: +1%, too small. c: +2 points, steady. d: +10%, but it swings that much day to day.
  const after = [day(1100, 10.1, 0.07, 1300), day(1110, 10.2, 0.071, 900), day(1090, 10, 0.069, 1100)];
  assert.deepEqual(
    significantStatChanges(stats, before, after, 5).map((change) => change.key),
    ["c", "a"],
  );
  assert.deepEqual(
    significantStatChanges(stats, before, after, 1).map((change) => change.key),
    ["c"],
  );
});

test("soulsPerMinute", () => {
  assert.equal(soulsPerMinute(30_000, 1800), 1000);
  assert.equal(soulsPerMinute(30_000, 0), null);
});

test("compareTallies with a base: a share of player-matches, capped at all of them", () => {
  const before = tallyBy([row(1, 0, 5, 10)], (r) => r.hero_id);
  const after = tallyBy([row(1, 0, 30, 60), row(2, 0, 60, 120)], (r) => r.hero_id);
  const changes = new Map(
    compareTallies(before, after, { minMatches: 1, pickRateMultiplier: 1, base: { before: 100, after: 100 } }).map(
      (c) => [c.id, c],
    ),
  );
  assert.equal(changes.get(1)?.pickRate, 0.6);
  assert.equal(changes.get(1)?.pickRateDelta, 0.5);
  assert.equal(changes.get(2)?.pickRate, 1);
});
