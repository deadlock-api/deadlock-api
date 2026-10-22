import assert from "node:assert/strict";
import { test } from "node:test";

import { computeZScores, scoringInputs } from "./hero-scoring";

const rows = [
  { hero_id: 1, wins: 55, matches: 100, bucket_matches_since_first_day: 300 },
  { hero_id: 2, wins: 50, matches: 100, bucket_matches_since_first_day: 300 },
  { hero_id: 3, wins: 45, matches: 100, bucket_matches_since_first_day: 300 },
];

test("a hero no one banned keeps its period on the formula with bans", () => {
  // Hero 3 has no ban rows, as heroes that can't be banned never do.
  const inputs = scoringInputs(
    rows,
    12,
    new Map([
      [1, 0.3],
      [2, 0.1],
    ]),
  );
  assert.deepEqual(
    inputs.map((input) => input.banrate),
    [0.3, 0.1, 0],
  );
  const withExplicitZero = scoringInputs(
    rows,
    12,
    new Map([
      [1, 0.3],
      [2, 0.1],
      [3, 0],
    ]),
  );
  assert.deepEqual(computeZScores(inputs), computeZScores(withExplicitZero));
});

test("without ban data the period scores on win and pick rate alone", () => {
  for (const banRates of [undefined, new Map<number, number>()]) {
    assert.deepEqual(
      scoringInputs(rows, 12, banRates).map((input) => input.banrate),
      [undefined, undefined, undefined],
    );
  }
});
