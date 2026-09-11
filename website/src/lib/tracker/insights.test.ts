import assert from "node:assert/strict";
import { test } from "node:test";

import { computePlaytimeHabits, computeSessionMomentum, summarize, type TrackerHeroRow } from "./compute";
import { computeInsights } from "./insights";

function input(overrides: Partial<Parameters<typeof computeInsights>[0]> = {}): Parameters<typeof computeInsights>[0] {
  return {
    summary: { ...summarize([]), matches: 100, wins: 50, losses: 50, winrate: 0.5 },
    heroRows: [],
    splits: { byDuration: [], bySide: [] },
    momentum: computeSessionMomentum([]),
    habits: computePlaytimeHabits([]),
    ...overrides,
  };
}

function hero(heroId: number, matches: number, wins: number): TrackerHeroRow {
  return {
    ...summarize([]),
    heroId,
    matches,
    wins,
    losses: matches - wins,
    winrate: wins / matches,
    lastPlayedUnix: 0,
  };
}

test("withholds empty, small-sample, and flat win-rate patterns", () => {
  assert.deepEqual(computeInsights(input()), []);
  assert.deepEqual(
    computeInsights(
      input({
        heroRows: [hero(1, 7, 7), hero(2, 20, 10)],
        splits: { byDuration: [{ label: "Short", matches: 11, wins: 11 }], bySide: [] },
      }),
    ),
    [],
  );
});

test("uses unrounded gaps for the five-point threshold and displays one decimal", () => {
  const result = computeInsights(
    input({
      summary: { ...summarize([]), winrate: 0.504 },
      heroRows: [hero(1, 20, 11), hero(2, 20, 9), hero(3, 20, 12)],
    }),
  );
  assert.ok(!result.some((insight) => insight.heroId === 1), "a 4.6-point gap must not qualify");
  assert.equal(result.find((insight) => insight.heroId === 2)?.delta, "−5.4");
  assert.equal(result.find((insight) => insight.heroId === 3)?.value, "60.0%");
  assert.equal(result.find((insight) => insight.heroId === 3)?.delta, "+9.6");
});

test("accepts the sample boundaries and an exact five-point gap", () => {
  const result = computeInsights(
    input({
      heroRows: [hero(1, 8, 6), hero(2, 20, 9)],
      splits: { byDuration: [{ label: "Short", matches: 12, wins: 9 }], bySide: [] },
    }),
  );
  assert.equal(result.length, 3);
  assert.equal(result.find((insight) => insight.heroId === 2)?.delta, "−5.0");
});

test("prefers a larger sample at the same gap and keeps one hero per direction", () => {
  const heroRows = [hero(1, 8, 6), hero(2, 40, 30), hero(3, 8, 2), hero(4, 40, 10)];
  const original = structuredClone(heroRows);
  const result = computeInsights(input({ heroRows }));
  assert.deepEqual(
    result.map((insight) => insight.heroId),
    [2, 4],
  );
  assert.deepEqual(
    result.map((insight) => insight.tone),
    ["good", "bad"],
  );
  assert.deepEqual(heroRows, original);
});

test("limits findings to five, ordered by score, with one finding per split category", () => {
  const base = input();
  const result = computeInsights(
    input({
      heroRows: [hero(1, 40, 30), hero(2, 40, 10)],
      splits: {
        byDuration: [
          { label: "Short", matches: 20, wins: 15 },
          { label: "Long", matches: 40, wins: 30 },
        ],
        bySide: [{ label: "Side", matches: 40, wins: 30 }],
      },
      momentum: {
        ...base.momentum,
        byPosition: [{ label: "1st match", matches: 40, wins: 30 }],
        byPreviousResult: [{ label: "After a loss", matches: 40, wins: 30 }],
      },
      habits: { ...base.habits, bestWeekday: { weekday: 0, matches: 40, wins: 30 } },
    }),
  );
  assert.equal(result.length, 5);
  assert.equal(result.filter((insight) => insight.id.startsWith("duration-")).length, 1);
  assert.ok(result.some((insight) => insight.id === "duration-Long"));
  assert.deepEqual(
    result.map((insight) => insight.score),
    result.map((insight) => insight.score).sort((a, b) => b - a),
  );
});

test("does not describe a weekday below the baseline as the weakest day", () => {
  const base = input();
  const result = computeInsights(
    input({ habits: { ...base.habits, bestWeekday: { weekday: 0, matches: 20, wins: 8 } } }),
  );
  assert.equal(result[0].headline, "Lower win rate on Monday");
});
