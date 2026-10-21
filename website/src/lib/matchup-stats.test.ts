import assert from "node:assert/strict";
import { test } from "node:test";

import { expectedPairingWinRate, heroMatchups, matchupWinRateChange } from "./matchup-stats";

/** A rate measured over so many matches that the shrinkage toward 50% is negligible. */
const exact = (rate: number) => ({ wins: rate * 1e9, matches: 1e9 });

test("heroes that do not interact show no change, however strong either is", () => {
  // Against a 60% enemy a 50% hero wins 40%: the old baseline (the hero's own rate) called that a 10-point counter.
  assert.ok(Math.abs(matchupWinRateChange(4e8, 1e9, exact(0.5), exact(0.6), "enemy")!) < 1e-6);
  // Two 60% teammates add up to 69.2% in log-odds; the mean of their rates (60%) called that a synergy.
  const pair = 0.36 / (0.36 + 0.16);
  assert.ok(Math.abs(matchupWinRateChange(pair * 1e9, 1e9, exact(0.6), exact(0.6), "ally")!) < 1e-6);
});

test("ally change is symmetric and enemy change flips sign with the perspective", () => {
  const a = { wins: 520, matches: 1000 };
  const b = { wins: 470, matches: 1000 };
  assert.equal(matchupWinRateChange(65, 100, a, b, "ally"), matchupWinRateChange(65, 100, b, a, "ally"));
  const aVsB = matchupWinRateChange(70, 100, a, b, "enemy")!;
  const bVsA = matchupWinRateChange(30, 100, b, a, "enemy")!;
  assert.ok(Math.abs(aVsB + bVsA) < 1e-12);
});

test("a handful of games moves the change only a little", () => {
  const even = { wins: 500, matches: 1000 };
  // 3 wins in 3: shrunk with 100 even matches to 53/103, not a 50-point gain.
  assert.ok(Math.abs(matchupWinRateChange(3, 3, even, even, "enemy")! - (53 / 103 - 0.5)) < 1e-12);
});

test("zero wins remain valid for current and previous periods", () => {
  const even = { wins: 5, matches: 10 };
  assert.ok(matchupWinRateChange(0, 10, even, even, "enemy")! < 0);
  assert.ok(Number.isFinite(matchupWinRateChange(0, 10, { wins: 0, matches: 10 }, { wins: 10, matches: 10 }, "ally")));
});

test("missing baselines and invalid samples never produce misleading or non-finite changes", () => {
  const even = { wins: 5, matches: 10 };
  for (const baseline of [undefined, { wins: 0, matches: 0 }, { wins: NaN, matches: 10 }]) {
    assert.equal(matchupWinRateChange(5, 10, baseline, even, "enemy"), undefined);
    assert.equal(matchupWinRateChange(5, 10, even, baseline, "ally"), undefined);
  }
  for (const [wins, matches] of [
    [0, 0],
    [1, 0],
    [-1, 10],
    [11, 10],
    [NaN, 10],
    [5, Infinity],
  ]) {
    assert.equal(matchupWinRateChange(wins, matches, even, even, "enemy"), undefined);
  }
});

test("a hero's matchups take either synergy side, skip other heroes' rows and sort best first", () => {
  const current = {
    heroStats: [
      { hero_id: 1, wins: 50, matches: 100 },
      { hero_id: 2, wins: 50, matches: 100 },
      { hero_id: 3, wins: 50, matches: 100 },
    ],
    synergies: [
      { hero_id1: 1, hero_id2: 2, wins: 40, matches_played: 100 },
      { hero_id1: 3, hero_id2: 1, wins: 60, matches_played: 100 },
      { hero_id1: 2, hero_id2: 3, wins: 90, matches_played: 100 },
    ],
    counters: [
      { hero_id: 1, enemy_hero_id: 2, wins: 70, matches_played: 100 },
      { hero_id: 1, enemy_hero_id: 3, wins: 30, matches_played: 100 },
      { hero_id: 2, enemy_hero_id: 1, wins: 30, matches_played: 100 },
    ],
  };
  const { synergyRows, counterRows } = heroMatchups(1, current);
  assert.deepEqual(
    synergyRows.map((row) => row.heroId),
    [3, 2],
  );
  assert.deepEqual(
    counterRows.map((row) => [row.heroId, Math.round(row.relWinrate * 100)]),
    [
      [2, 10],
      [3, -10],
    ],
  );
  assert.equal(synergyRows[0].prevRelWinrate, undefined);
});

test("the previous period only annotates pairings it also saw", () => {
  const period = (wins: number) => ({
    heroStats: [
      { hero_id: 1, wins: 50, matches: 100 },
      { hero_id: 2, wins: 50, matches: 100 },
    ],
    synergies: [],
    counters: [{ hero_id: 1, enemy_hero_id: 2, wins, matches_played: 100 }],
  });
  assert.ok(Math.abs(heroMatchups(1, period(60), period(40)).counterRows[0].prevRelWinrate! + 0.05) < 1e-10);
  assert.equal(heroMatchups(1, period(60), { ...period(40), counters: [] }).counterRows[0].prevRelWinrate, undefined);
});

test("the expected rate adds an ally's strength and takes an enemy's away", () => {
  const pair = 0.36 / (0.36 + 0.16);
  assert.ok(Math.abs(expectedPairingWinRate(exact(0.6), exact(0.6), "ally")! - pair) < 1e-6);
  assert.ok(Math.abs(expectedPairingWinRate(exact(0.6), exact(0.6), "enemy")! - 0.5) < 1e-6);
  assert.equal(expectedPairingWinRate(exact(0.6), undefined, "ally"), undefined);
  assert.equal(expectedPairingWinRate({ wins: 11, matches: 10 }, exact(0.5), "ally"), undefined);
});
