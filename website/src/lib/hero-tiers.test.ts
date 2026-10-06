import assert from "node:assert/strict";
import { test } from "node:test";

import { rankHeroes, tierOf } from "./hero-tiers";

test("tier cuts sit in standard deviations around the average hero", () => {
  assert.equal(tierOf(1.4), "s");
  assert.equal(tierOf(1), "s");
  assert.equal(tierOf(0.5), "a");
  assert.equal(tierOf(0), "b");
  assert.equal(tierOf(-0.35), "b");
  assert.equal(tierOf(-0.6), "c");
  assert.equal(tierOf(-1.2), "d");
});

test("heroes are ranked best first, an unplayed hero is left out", () => {
  const ranked = rankHeroes(
    [
      { heroId: 1, wins: 400, matches: 1000 },
      { heroId: 2, wins: 600, matches: 1000 },
      { heroId: 3, wins: 500, matches: 1000 },
      { heroId: 4, wins: 0, matches: 0 },
      { heroId: 5, wins: 500, matches: 1000 },
      { heroId: 6, wins: 500, matches: 1000 },
    ],
    12,
  );
  assert.deepEqual(
    ranked.map((hero) => hero.heroId),
    [2, 3, 5, 6, 1],
  );
  assert.deepEqual(
    ranked.map((hero) => hero.tier),
    ["s", "b", "b", "b", "d"],
  );
  assert.equal(ranked[0].winRate, 0.6);
  assert.equal(ranked[0].pickRate, 2.4);
});

test("no matches, no tiers", () => {
  assert.deepEqual(rankHeroes([], 12), []);
});
