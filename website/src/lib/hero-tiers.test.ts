import assert from "node:assert/strict";
import { test } from "node:test";

import { computeHeroTiers, groupByTier, tierOfScore } from "./hero-tiers";

/** A hero with a win rate over a number of matches. */
const hero = (heroId: number, winRate: number, matches: number) => ({
  heroId,
  wins: Math.round(winRate * matches),
  matches,
});

test("scores map onto S to D at the documented thresholds", () => {
  assert.equal(tierOfScore(1.5), "S");
  assert.equal(tierOfScore(1), "S");
  assert.equal(tierOfScore(0.5), "A");
  assert.equal(tierOfScore(0), "B");
  assert.equal(tierOfScore(-0.4), "C");
  assert.equal(tierOfScore(-0.99), "C");
  assert.equal(tierOfScore(-1), "D");
});

test("a large, spread-out sample fills every tier, best first", () => {
  const rates = [0.56, 0.545, 0.53, 0.52, 0.51, 0.5, 0.5, 0.49, 0.48, 0.47, 0.455, 0.44];
  const { entries, averageWinRate, spread } = computeHeroTiers(rates.map((wr, i) => hero(i + 1, wr, 100_000)));
  assert.ok(Math.abs(averageWinRate - 0.5) < 0.001);
  assert.ok(spread > 0.03 && spread < 0.04, `spread ${spread}`);
  assert.deepEqual(
    entries.map((e) => e.heroId),
    rates.map((_, i) => i + 1),
  );
  const tiers = groupByTier(entries);
  assert.deepEqual(
    tiers.map((t) => t.tier),
    ["S", "A", "B", "C", "D"],
  );
  for (const tier of tiers) assert.ok(tier.entries.length > 0, `${tier.tier} is empty`);
  assert.equal(entries[0].tier, "S");
  assert.equal(entries.at(-1)?.tier, "D");
});

test("a high win rate on a thin sample is pulled towards the average", () => {
  const rows = [
    hero(1, 0.54, 200_000),
    hero(2, 0.58, 150),
    hero(3, 0.5, 200_000),
    hero(4, 0.46, 200_000),
    hero(5, 0.52, 200_000),
    hero(6, 0.48, 200_000),
  ];
  const { entries } = computeHeroTiers(rows);
  const big = entries.find((e) => e.heroId === 1)!;
  const thin = entries.find((e) => e.heroId === 2)!;
  assert.ok(thin.winRate > big.winRate);
  assert.ok(thin.score < big.score, "the proven hero ranks above the lucky one");
  assert.ok(Math.abs(thin.shrunkWinRate - 0.5) < Math.abs(thin.winRate - 0.5));
  assert.ok(Math.abs(big.shrunkWinRate - big.winRate) < 0.001, "a big sample barely moves");
});

test("no spread beyond noise puts every hero in B", () => {
  // Two heroes a coin flip apart on a handful of matches: nothing to rank.
  const { entries, spread } = computeHeroTiers([hero(1, 0.52, 50), hero(2, 0.48, 50)]);
  assert.equal(spread, 0);
  assert.deepEqual(
    entries.map((e) => e.tier),
    ["B", "B"],
  );
});

test("empty input and heroes without matches give no entries", () => {
  assert.deepEqual(computeHeroTiers([]).entries, []);
  assert.deepEqual(computeHeroTiers([{ heroId: 1, wins: 0, matches: 0 }]).entries, []);
  assert.deepEqual(
    groupByTier([]).map((t) => t.entries.length),
    [0, 0, 0, 0, 0],
  );
});

test("pick share sums to one", () => {
  const { entries } = computeHeroTiers([hero(1, 0.5, 300), hero(2, 0.55, 100)]);
  assert.ok(Math.abs(entries.reduce((s, e) => s + e.share, 0) - 1) < 1e-9);
});
