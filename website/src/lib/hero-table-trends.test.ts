import assert from "node:assert/strict";
import { test } from "node:test";

import type { AnalyticsHeroStats } from "deadlock_api_client";

import { buildHeroTableTrend } from "./hero-table-trends";

const row = (bucket: number, hero_id: number, matches: number, wins: number) =>
  ({ bucket, hero_id, matches, wins }) as AnalyticsHeroStats;
const options = {
  heroes: [row(2000, 1, 100, 60), row(1000, 1, 20, 10), row(1000, 2, 80, 30), row(2000, 2, 100, 40)],
  bans: [
    { bucket: 1000, hero_id: 1, bans: 10 },
    { bucket: 1000, hero_id: 2, bans: 30 },
  ],
  heroId: 1,
  pickrateMultiplier: 2,
  normalizedPickrate: false,
};

test("rates use each bucket's full roster, with normalized pick rates using its most played hero", () => {
  assert.deepEqual(
    buildHeroTableTrend({ ...options, stat: "winRate" }).map((p) => p.value),
    [0.5, 0.6],
  );
  assert.deepEqual(
    buildHeroTableTrend({ ...options, stat: "pickRate" }).map((p) => p.value),
    [0.4, 1],
  );
  assert.deepEqual(
    buildHeroTableTrend({ ...options, stat: "pickRate", normalizedPickrate: true }).map((p) => p.value),
    [0.25, 1],
  );
  assert.deepEqual(buildHeroTableTrend({ ...options, stat: "banRate" }), [{ date: 1000000, value: 0.5 }]);
  assert.deepEqual(
    buildHeroTableTrend({ ...options, stat: "presence" }).map((p) => p.value),
    [0.9, null],
  );
});

test("low-sample and missing heroes produce gaps instead of spiking to 0 or 100 percent", () => {
  const heroes = [row(1000, 1, 1, 1), row(1000, 2, 100, 50), row(2000, 2, 100, 50), row(3000, 1, 100, 55)];
  const points = buildHeroTableTrend({ ...options, heroes, stat: "winRate", minMatchesPerBucket: 10 });
  assert.deepEqual(
    points.map((p) => p.value),
    [null, null, 0.55],
  );
  assert.equal(points[2].matches, 100);
  assert.deepEqual(buildHeroTableTrend({ ...options, stat: "banRate", minMatchesPerBucket: 21 }), []);
});

test("zero bans are valid when the bucket has enough matches, and score trends work without bans", () => {
  assert.equal(buildHeroTableTrend({ ...options, heroId: 3, stat: "banRate", minMatchesPerBucket: 10 })[0].value, 0);
  const heroes = [row(1000, 1, 100, 60), row(1000, 2, 100, 40)];
  const scores = buildHeroTableTrend({ ...options, heroes, bans: [], stat: "zScore" });
  assert.ok(Math.abs(scores[0].value! - 0.6 / 0.85) < 1e-10);
  assert.ok(Number.isFinite(buildHeroTableTrend({ ...options, heroes, bans: [], stat: "residual" })[0].value));
});
