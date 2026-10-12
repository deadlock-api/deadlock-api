import assert from "node:assert/strict";
import { test } from "node:test";

import { computeSwapRates } from "./swap-rate";

const row = (hero_id: number, bucket: number, over: Partial<Parameters<typeof computeSwapRates>[0][number]> = {}) => ({
  hero_id,
  bucket,
  matches: 0,
  swapped_in: 0,
  swapped_in_wins: 0,
  pregame_picks: 0,
  swapped_away: 0,
  ...over,
});

test("swap rates sum every bucket of a hero", () => {
  const rates = computeSwapRates([
    row(6, 1, { matches: 60, swapped_in: 10, swapped_in_wins: 4, pregame_picks: 55, swapped_away: 5 }),
    row(6, 2, { matches: 40, swapped_in: 10, swapped_in_wins: 6, pregame_picks: 45, swapped_away: 15 }),
  ]);
  assert.deepEqual(rates.get(6), {
    matches: 100,
    swappedIn: 20,
    swapInRate: 0.2,
    swapInWinRate: 0.5,
    pregamePicks: 100,
    swapAwayRate: 0.2,
  });
});

test("a hero nobody swapped onto has no swap-in win rate, and an empty sample rates zero", () => {
  const rates = computeSwapRates([row(4, 0, { matches: 10, pregame_picks: 0 })]);
  assert.equal(rates.get(4)?.swapInRate, 0);
  assert.equal(rates.get(4)?.swapInWinRate, undefined);
  assert.equal(rates.get(4)?.swapAwayRate, 0);
});
