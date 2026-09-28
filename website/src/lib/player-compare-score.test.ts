import assert from "node:assert/strict";
import { test } from "node:test";

import { COMPARE_STATS, type PlayerAggregate, SCORED_STAT_COUNT, scoreComparison, statWinners } from "./player-compare";

/** A player whose every stat equals the default, so only the overrides decide a stat. */
function aggregate(overrides: Partial<PlayerAggregate> = {}): PlayerAggregate {
  return {
    matches: 10,
    winRate: 0.5,
    kda: 2,
    kills: 5,
    deaths: 5,
    assists: 5,
    netWorthPerMin: 1000,
    damagePerMin: 1000,
    damageTakenPerMin: 1000,
    objDamagePerMin: 100,
    lastHitsPerMin: 5,
    deniesPerMatch: 2,
    accuracy: 0.5,
    critShotRate: 0.1,
    mvpRate: 0.1,
    top3Rate: 0.3,
    damagePerSoul: 1,
    damageMitigatedPerMin: 100,
    heroesPlayed: 3,
    avgMatchSeconds: 1800,
    timePlayed: 18000,
    healingPerMin: 50,
    healPreventedPerMatch: 500,
    rankBadge: 100,
    ...overrides,
  };
}

const keys = (stats: readonly { key: string }[]) => stats.map((stat) => stat.key);

test("statWinners: the best value wins, by polarity", () => {
  assert.deepEqual(statWinners([1, 3, 2], "higher"), [1]);
  assert.deepEqual(statWinners([1, 3, 2], "lower"), [0]);
  assert.deepEqual(statWinners([1, 3, 2], "none"), []);
});

test("statWinners: ties share the win", () => {
  assert.deepEqual(statWinners([3, 1, 3], "higher"), [0, 2]);
  assert.deepEqual(statWinners([1, 1, 3], "lower"), [0, 1]);
});

test("statWinners: everyone tied means nobody wins", () => {
  assert.deepEqual(statWinners([2, 2, 2], "higher"), []);
  assert.deepEqual(statWinners([2, 2], "lower"), []);
});

test("statWinners: a single value, or none, wins nothing", () => {
  assert.deepEqual(statWinners([5], "higher"), []);
  assert.deepEqual(statWinners([5, null, undefined], "higher"), []);
  assert.deepEqual(statWinners([Number.NaN, 5], "higher"), []);
  assert.deepEqual(statWinners([], "higher"), []);
});

test("statWinners: players without a value never win", () => {
  assert.deepEqual(statWinners([null, 1, 2], "lower"), [1]);
  assert.deepEqual(statWinners([undefined, 1, Number.POSITIVE_INFINITY, 2], "higher"), [3]);
});

test("scoreComparison: settled once every player is loaded, even one without matches", () => {
  const result = scoreComparison([aggregate({ kills: 6 }), aggregate(), null]);
  assert.equal(result.settled, true);
  assert.equal(result.stats.length, COMPARE_STATS.length);
  assert.equal(result.scored.length, SCORED_STAT_COUNT);
  assert.deepEqual(result.tally, [1, 0, 0]);
  assert.deepEqual(result.leaders, [0]);
});

test("scoreComparison: not settled while a player or one of its values is still loading", () => {
  const loading = scoreComparison([aggregate({ kills: 6 }), undefined]);
  assert.equal(loading.settled, false);
  // A loading player keeps every stat in, since it may still have a value.
  assert.equal(loading.stats.length, COMPARE_STATS.length);

  const rankLoading = scoreComparison([aggregate({ rankBadge: undefined }), aggregate()]);
  assert.equal(rankLoading.settled, false);
});

test("scoreComparison: a stat no player has is dropped and not scored", () => {
  const result = scoreComparison([
    aggregate({ mvpRate: null, healingPerMin: null }),
    aggregate({ mvpRate: null, healingPerMin: 60 }),
  ]);
  assert.ok(!keys(result.stats).includes("mvpRate"));
  assert.ok(!keys(result.scored).includes("mvpRate"));
  assert.ok(keys(result.scored).includes("healingPerMin"));
  assert.equal(result.scored.length, SCORED_STAT_COUNT - 1);
  assert.equal(result.settled, true);
  // Only one player has healing, and a single value wins nothing.
  assert.deepEqual(result.tally, [0, 0]);
});

test("scoreComparison: nobody leads with fewer than two players with matches", () => {
  const alone = scoreComparison([aggregate({ kills: 6 })]);
  assert.deepEqual(alone.leaders, []);

  const withoutMatches = scoreComparison([aggregate({ kills: 6 }), null]);
  assert.deepEqual(withoutMatches.tally, [0, 0]);
  assert.deepEqual(withoutMatches.leaders, []);
});

test("scoreComparison: tied tallies share the lead", () => {
  const result = scoreComparison([aggregate({ kills: 6 }), aggregate({ assists: 6 }), aggregate()]);
  assert.deepEqual(result.tally, [1, 1, 0]);
  assert.deepEqual(result.leaders, [0, 1]);
});

test("scoreComparison: every stat tied leaves nobody leading", () => {
  const result = scoreComparison([aggregate(), aggregate(), aggregate()]);
  assert.deepEqual(result.tally, [0, 0, 0]);
  assert.deepEqual(result.leaders, []);
});

test("scoreComparison: wins are judged on the printed value", () => {
  // Both print as a 2.00 KDA, so neither wins it.
  const result = scoreComparison([aggregate({ kda: 2.001 }), aggregate({ kda: 2.004 })]);
  assert.deepEqual(result.tally, [0, 0]);
});
