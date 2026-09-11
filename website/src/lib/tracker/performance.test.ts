import assert from "node:assert/strict";
import { test } from "node:test";

import type { PlayerMatchHistoryEntry } from "deadlock_api_client";

import { computePerformanceTrend, performanceWindow } from "./compute";

function match(matchId: number, overrides: Partial<PlayerMatchHistoryEntry> = {}): PlayerMatchHistoryEntry {
  return {
    account_id: 1,
    match_id: matchId,
    start_time: matchId * 3600,
    match_duration_s: 1200,
    hero_id: 1,
    hero_level: 20,
    game_mode: 1,
    match_mode: 4,
    match_result: 0,
    player_team: 0,
    player_match_outcome: 1,
    player_kills: 4,
    player_deaths: 2,
    player_assists: 6,
    net_worth: 20000,
    last_hits: 100,
    denies: 5,
    objectives_mask_team0: 0,
    objectives_mask_team1: 0,
    ...overrides,
  };
}

test("rolling windows use aggregate combat and economy totals and drop the oldest match", () => {
  const entries = [
    match(3, { player_kills: 1, player_assists: 1, player_deaths: 1, net_worth: 6000, match_duration_s: 600 }),
    match(1),
    match(2, {
      match_result: 1,
      player_kills: 10,
      player_assists: 0,
      player_deaths: 8,
      net_worth: 12000,
      match_duration_s: 600,
    }),
  ];
  const original = [...entries];
  assert.deepEqual(computePerformanceTrend(entries, 2), [
    { matchNumber: 2, time: 7200, winrate: 0.5, kdaRatio: 2, soulsPerMin: 32000 / 30 },
    { matchNumber: 3, time: 10800, winrate: 0.5, kdaRatio: 12 / 9, soulsPerMin: 900 },
  ]);
  assert.deepEqual(entries, original, "must not reorder the match history shared by other panels");
});

test("only complete windows produce points, including exactly one full window", () => {
  const entries = Array.from({ length: 50 }, (_, index) => match(index + 1));
  for (const window of [5, 10, 20, 50]) {
    assert.deepEqual(computePerformanceTrend(entries.slice(0, window - 1), window), []);
    assert.equal(computePerformanceTrend(entries.slice(0, window), window).length, 1);
    assert.equal(computePerformanceTrend(entries, window).length, 51 - window);
  }
  assert.deepEqual(computePerformanceTrend([], 10), []);
  assert.equal(performanceWindow(0), 10);
  assert.equal(performanceWindow(1000), 10);
  assert.equal(performanceWindow(1001), 11);
});

test("equal timestamps use match IDs so response ordering cannot change the latest window", () => {
  const entries = [
    match(3, { start_time: 100 }),
    match(1, { start_time: 100, match_result: 1 }),
    match(2, { start_time: 100 }),
  ];
  const points = computePerformanceTrend(entries, 2);
  assert.deepEqual(points, computePerformanceTrend([...entries].reverse(), 2));
  assert.equal(points.at(-1)?.winrate, 1);
});

test("zero deaths and zero duration never produce an infinite trend value", () => {
  const [point] = computePerformanceTrend([match(1, { player_deaths: 0, match_duration_s: 0 })], 1);
  assert.equal(point.kdaRatio, 10);
  assert.equal(point.soulsPerMin, 0);
});
