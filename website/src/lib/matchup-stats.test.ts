import assert from "node:assert/strict";
import { test } from "node:test";

import { matchupWinRateChange } from "./matchup-stats";

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
