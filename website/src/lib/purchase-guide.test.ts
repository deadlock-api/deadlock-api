import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateTierHorizons,
  type GroupedPurchaseBucket,
  groupPurchaseBuckets,
  selectPurchaseWindows,
} from "./purchase-guide";
import { wilsonScoreInterval } from "./wilson";

function grouped(start: number, end: number, wins: number, matches: number): GroupedPurchaseBucket {
  return {
    bucketStart: start,
    bucketEnd: end,
    wins,
    matches,
    trueWinRate: wins / matches,
    wilsonLowerBound: wilsonScoreInterval(wins, matches)[0],
  };
}

test("groups 1k API rows into stable intervals", () => {
  const result = groupPurchaseBuckets(
    [
      { bucket: 1000, wins: 6, matches: 10 },
      { bucket: 2000, wins: 5, matches: 10 },
      { bucket: 3000, wins: 4, matches: 10 },
    ],
    2000,
  );

  assert.deepEqual(
    result.map(({ bucketStart, bucketEnd, wins, matches }) => ({ bucketStart, bucketEnd, wins, matches })),
    [
      { bucketStart: 0, bucketEnd: 2000, wins: 6, matches: 10 },
      { bucketStart: 2000, bucketEnd: 4000, wins: 9, matches: 20 },
    ],
  );
});

test("tier horizons are twice the weighted median purchase net worth", () => {
  const horizons = calculateTierHorizons([
    {
      tier: 1,
      buckets: [
        { bucket: 4000, wins: 30, matches: 60 },
        { bucket: 40000, wins: 30, matches: 40 },
      ],
    },
    {
      tier: 3,
      buckets: [
        { bucket: 14000, wins: 30, matches: 40 },
        { bucket: 24000, wins: 50, matches: 60 },
      ],
    },
  ]);

  assert.equal(horizons.get(1), 9000);
  assert.equal(horizons.get(3), 49000);
});

test("rejects a statistically strong but impractical late rebound", () => {
  const windows = selectPurchaseWindows(
    [
      grouped(0, 5000, 62, 100),
      grouped(5000, 10000, 59, 100),
      grouped(10000, 15000, 35, 100),
      grouped(40000, 45000, 90, 100),
    ],
    15000,
    400,
  );

  assert.deepEqual(
    windows.map(({ bucketStart, bucketEnd }) => [bucketStart, bucketEnd]),
    [[0, 10000]],
  );
});

test("returns two supported, separated purchase windows", () => {
  const windows = selectPurchaseWindows(
    [
      grouped(0, 5000, 61, 100),
      grouped(5000, 10000, 58, 100),
      grouped(10000, 15000, 35, 100),
      grouped(15000, 20000, 38, 100),
      grouped(20000, 25000, 65, 100),
      grouped(25000, 30000, 62, 100),
    ],
    30000,
    600,
  );

  assert.deepEqual(
    windows.map(({ bucketStart, bucketEnd }) => [bucketStart, bucketEnd]),
    [
      [0, 10000],
      [20000, 30000],
    ],
  );
});

test("suppresses buckets without enough evidence", () => {
  const windows = selectPurchaseWindows([grouped(0, 5000, 9, 10), grouped(5000, 10000, 8, 10)], 10000, 1000);

  assert.deepEqual(windows, []);
});
