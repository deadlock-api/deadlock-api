import assert from "node:assert/strict";
import { test } from "node:test";

import { type HeroTierInput, rankHeroes, tierOf } from "./hero-tiers";

const hero = (heroId: number, wins: number, matches: number, over: Partial<HeroTierInput> = {}): HeroTierInput => ({
  heroId,
  wins,
  matches,
  bucket_matches_since_first_day: 0,
  total_kills: 5 * matches,
  total_deaths: 5 * matches,
  total_assists: 10 * matches,
  total_net_worth: 30_000 * matches,
  total_last_hits: 200 * matches,
  total_denies: 10 * matches,
  total_player_damage: 30_000 * matches,
  total_player_damage_taken: 30_000 * matches,
  total_boss_damage: 5_000 * matches,
  total_shots_hit: 300 * matches,
  total_shots_missed: 700 * matches,
  ...over,
});

/** Every hero out for the whole range: each one's pick rate base is all heroes' matches. */
const outAllRange = (rows: HeroTierInput[]): HeroTierInput[] => {
  const total = rows.reduce((sum, row) => sum + row.matches, 0);
  return rows.map((row) => ({ ...row, bucket_matches_since_first_day: total }));
};

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
    outAllRange([
      hero(1, 400, 1000),
      hero(2, 600, 1000),
      hero(3, 500, 1000),
      hero(4, 0, 0),
      hero(5, 500, 1000),
      hero(6, 500, 1000),
    ]),
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

test("another metric ranks and tiers by that rate alone", () => {
  const rows = outAllRange([
    hero(1, 600, 500 * 2),
    hero(2, 300, 600),
    hero(3, 500, 1000),
    hero(4, 1000, 2000),
    hero(5, 1500, 3000),
  ]);
  assert.deepEqual(
    rankHeroes(rows, 12, undefined, "pickRate").map((hero) => hero.heroId),
    [5, 4, 1, 3, 2],
  );
  assert.equal(rankHeroes(rows, 12, undefined, "winRate")[0].heroId, 1);
  // No bans in the data: ranking by ban rate is ranking by the tier score.
  assert.deepEqual(rankHeroes(rows, 12, undefined, "banRate"), rankHeroes(rows, 12));
});

test("a per-match metric ranks by its average, fewer deaths first", () => {
  const rows = outAllRange([
    hero(1, 500, 1000, { total_deaths: 3000 }),
    hero(2, 500, 1000, { total_deaths: 9000 }),
    hero(3, 500, 1000, { total_deaths: 6000 }),
  ]);
  const ranked = rankHeroes(rows, 12, undefined, "deaths");
  assert.deepEqual(
    ranked.map((entry) => entry.heroId),
    [1, 3, 2],
  );
  assert.equal(ranked[0].reading, 3);
});

test("a hero released within the range picks from its first day on", () => {
  // Hero 3 came out late: in 600 of the 1,200 picks since, where all heroes were picked 4,500 times over the range.
  const rows = [
    hero(1, 1000, 2000, { bucket_matches_since_first_day: 4500 }),
    hero(2, 950, 1900, { bucket_matches_since_first_day: 4500 }),
    hero(3, 300, 600, { bucket_matches_since_first_day: 1200 }),
  ];
  const pickRates = new Map(rankHeroes(rows, 1).map((entry) => [entry.heroId, entry.pickRate]));
  assert.equal(pickRates.get(3), 0.5);
  assert.ok(pickRates.get(3)! > pickRates.get(1)!);
});
