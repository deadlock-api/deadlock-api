import assert from "node:assert/strict";
import { test } from "node:test";

import { heroMatchups, matchupWinRateChange } from "./matchup-stats";

test("ally impact uses both heroes' baselines and is symmetric", () => {
  const heroes = [
    { wins: 40, matches: 100 },
    { wins: 60, matches: 100 },
  ];
  assert.ok(Math.abs(matchupWinRateChange(65, 100, heroes)! - 0.15) < 1e-10);
  assert.equal(matchupWinRateChange(65, 100, heroes), matchupWinRateChange(65, 100, heroes.toReversed()));
});

test("opponent impact is from the selected hero's perspective", () => {
  assert.equal(matchupWinRateChange(30, 100, [{ wins: 50, matches: 100 }]), -0.2);
});

test("zero wins remain valid for current and previous periods", () => {
  assert.equal(matchupWinRateChange(0, 10, [{ wins: 5, matches: 10 }]), -0.5);
  assert.equal(matchupWinRateChange(0, 10, [{ wins: 0, matches: 10 }]), 0);
});

test("missing baselines and invalid samples never produce misleading or non-finite changes", () => {
  for (const baselines of [[], [undefined], [{ wins: 0, matches: 0 }], [{ wins: NaN, matches: 10 }]]) {
    assert.equal(matchupWinRateChange(5, 10, baselines), undefined);
  }
  for (const [wins, matches] of [
    [0, 0],
    [1, 0],
    [-1, 10],
    [11, 10],
    [NaN, 10],
    [5, Infinity],
  ]) {
    assert.equal(matchupWinRateChange(wins, matches, [{ wins: 5, matches: 10 }]), undefined);
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
      [2, 20],
      [3, -20],
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
  assert.ok(Math.abs(heroMatchups(1, period(60), period(40)).counterRows[0].prevRelWinrate! + 0.1) < 1e-10);
  assert.equal(heroMatchups(1, period(60), { ...period(40), counters: [] }).counterRows[0].prevRelWinrate, undefined);
});
