import assert from "node:assert/strict";
import { test } from "node:test";

import { computeBanRates, computeBanRatesByBucket, totalBanMatches } from "./ban-rate";

// Bucket 1: 10 ranked matches with 3 bans each. Bucket 2: 10 unranked matches with 2 bans each.
const bans = [
  { bucket: 1, hero_id: 1, bans: 8, matches: 10 },
  { bucket: 1, hero_id: 2, bans: 10, matches: 10 },
  { bucket: 1, hero_id: 3, bans: 6, matches: 10 },
  { bucket: 1, hero_id: 4, bans: 6, matches: 10 },
  { bucket: 2, hero_id: 1, bans: 5, matches: 10 },
  { bucket: 2, hero_id: 3, bans: 10, matches: 10 },
  { bucket: 2, hero_id: 5, bans: 5, matches: 10 },
];

test("ban rates divide by the matches with ban data, whatever the bans per match", () => {
  assert.equal(totalBanMatches(bans), 20);
  assert.deepEqual(
    computeBanRates(bans),
    new Map([
      [1, 0.65],
      [2, 0.5],
      [3, 0.8],
      [4, 0.3],
      [5, 0.25],
    ]),
  );
  const byBucket = computeBanRatesByBucket(bans);
  assert.equal(byBucket.get(1)?.get(1), 0.8);
  assert.equal(byBucket.get(1)?.get(2), 1);
  assert.equal(byBucket.get(2)?.get(3), 1);
  assert.deepEqual(computeBanRates([]), new Map());
});
