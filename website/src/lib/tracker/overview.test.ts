import assert from "node:assert/strict";
import { test } from "node:test";

import type { PlayerMatchHistoryEntry } from "deadlock_api_client";

import { compareRecentMatches, MIN_COMPARISON_MATCHES, RECENT_MATCH_WINDOWS } from "./overview";

function match(id: number, overrides: Partial<PlayerMatchHistoryEntry> = {}): PlayerMatchHistoryEntry {
  return {
    account_id: 1,
    match_id: id,
    start_time: id * 3600,
    hero_id: 1,
    hero_level: 10,
    game_mode: 1,
    match_mode: 1,
    player_team: 0,
    match_result: 0,
    player_match_outcome: 1,
    player_kills: 5,
    player_deaths: 2,
    player_assists: 5,
    net_worth: 10000,
    match_duration_s: 1200,
    last_hits: 50,
    denies: 2,
    objectives_mask_team0: 0,
    objectives_mask_team1: 0,
    ...overrides,
  };
}

test("compares the latest 20 matches with the preceding 20, regardless of input order", () => {
  const entries = Array.from({ length: 45 }, (_, i) => match(i + 1, { match_result: i >= 25 ? 0 : 1 }));
  const original = [...entries];
  const { recent, previous, entries: latest } = compareRecentMatches(entries);
  assert.equal(latest[0].match_id, 45);
  assert.equal(latest.at(-1)?.match_id, 26);
  assert.equal(recent.matches, 20);
  assert.equal(recent.winrate, 1);
  assert.equal(previous?.matches, 20);
  assert.equal(previous?.winrate, 0);
  assert.deepEqual(entries, original, "does not mutate the cached match history");
});

test("withholds comparisons until there are at least five baseline matches", () => {
  for (const count of [0, 1, 19, 20, 24]) {
    const result = compareRecentMatches(Array.from({ length: count }, (_, i) => match(i)));
    assert.equal(result.previous, null);
    assert.equal(result.recent.matches, Math.min(count, 20));
  }
  assert.equal(compareRecentMatches(Array.from({ length: 25 }, (_, i) => match(i))).previous?.matches, 5);
});

test("uses duration-weighted economy and aggregate KDA instead of averaging match ratios", () => {
  const { recent } = compareRecentMatches([
    match(1, { player_kills: 10, player_assists: 0, player_deaths: 1, net_worth: 10000, match_duration_s: 600 }),
    match(2, { player_kills: 0, player_assists: 10, player_deaths: 9, net_worth: 10000, match_duration_s: 1800 }),
  ]);
  assert.equal(recent.soulsPerMin, 500);
  assert.equal(recent.kdaRatio, 2);
  assert.equal(recent.avgDeaths, 5);
});

test("handles zero duration and deathless matches without nonfinite metrics", () => {
  const { recent } = compareRecentMatches([match(1, { player_deaths: 0, match_duration_s: 0 })]);
  assert.equal(recent.soulsPerMin, 0);
  assert.equal(recent.kdaRatio, 10);
});

test("streaks retain outcome interruptions and extend beyond the recent window", () => {
  const entries = Array.from({ length: 30 }, (_, i) => match(i + 1, { match_result: i >= 27 ? 1 : 0 }));
  const { streaks, recent } = compareRecentMatches(entries);
  assert.equal(recent.matches, 20);
  assert.equal(recent.wins, 17);
  assert.deepEqual(streaks, { current: -3, longestWin: 27, longestLoss: 3 });
});

test("uses match ID to break tied timestamps consistently for recent results and streaks", () => {
  const { streaks, entries } = compareRecentMatches([
    match(1, { start_time: 100, match_result: 1 }),
    match(3, { start_time: 100 }),
    match(2, { start_time: 100 }),
  ]);
  assert.deepEqual(
    entries.map((entry) => entry.match_id),
    [3, 2, 1],
  );
  assert.deepEqual(streaks, { current: 2, longestWin: 2, longestLoss: 1 });
});

for (const window of RECENT_MATCH_WINDOWS) {
  test(`${window}-match windows use disjoint samples and expose their exact match ranges`, () => {
    const entries = Array.from({ length: 120 }, (_, i) => match(i + 1));
    const result = compareRecentMatches(entries, window);
    assert.equal(result.window, window);
    assert.equal(result.recent.matches, window);
    assert.equal(result.previous?.matches, window);
    assert.equal(result.entries[0].match_id, 120);
    assert.equal(result.entries.at(-1)?.match_id, 121 - window);
    assert.equal(result.previousEntries[0].match_id, 120 - window);
    assert.equal(result.previousEntries.at(-1)?.match_id, 121 - window * 2);
    const recentIds = new Set(result.entries.map((entry) => entry.match_id));
    assert.ok(result.previousEntries.every((entry) => !recentIds.has(entry.match_id)));
  });

  test(`${window}-match comparisons require a complete recent window and five earlier matches`, () => {
    for (const count of [0, window - 1, window, window + MIN_COMPARISON_MATCHES - 1]) {
      const result = compareRecentMatches(
        Array.from({ length: count }, (_, i) => match(i)),
        window,
      );
      assert.equal(result.previous, null);
      assert.equal(result.recent.matches, Math.min(count, window));
    }
    const result = compareRecentMatches(
      Array.from({ length: window + MIN_COMPARISON_MATCHES }, (_, i) => match(i)),
      window,
    );
    assert.equal(result.previous?.matches, MIN_COMPARISON_MATCHES);
  });
}

test("switching windows preserves the full-history streaks and recalculates the comparison", () => {
  const entries = Array.from({ length: 30 }, (_, i) => match(i + 1, { match_result: i >= 20 ? 1 : 0 }));
  const short = compareRecentMatches(entries, 10);
  const medium = compareRecentMatches(entries, 20);
  const long = compareRecentMatches(entries, 50);
  assert.equal(short.recent.winrate, 0);
  assert.equal(short.previous?.winrate, 1);
  assert.equal(medium.recent.winrate, 0.5);
  assert.equal(medium.previous?.matches, 10);
  assert.equal(long.previous, null);
  assert.deepEqual(short.streaks, medium.streaks);
  assert.deepEqual(short.streaks, long.streaks);
});
