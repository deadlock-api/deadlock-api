import assert from "node:assert/strict";
import { test } from "node:test";

import type { PlayerMatchHistoryEntry } from "deadlock_api_client";

import { filterMatches, MATCH_SORT_KEYS, SORT_DIRS, sortMatches } from "./compute";

function match(matchId: number, overrides: Partial<PlayerMatchHistoryEntry> = {}): PlayerMatchHistoryEntry {
  return {
    account_id: 1,
    match_id: matchId,
    start_time: 1000,
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

test("unknown rank changes follow recorded losses, zeroes, and gains in both directions", () => {
  const entries = [
    match(1, { ranked_delta: null }),
    match(2, { ranked_delta: -30 }),
    match(3, { ranked_delta: 0 }),
    match(4, { ranked_delta: 20 }),
    match(5),
  ];
  const ids = (dir: "asc" | "desc") => sortMatches(entries, "rankDelta", dir).map((entry) => entry.match_id);
  assert.deepEqual(ids("asc"), [2, 3, 4, 5, 1]);
  assert.deepEqual(ids("desc"), [4, 3, 2, 5, 1]);
});

test("tied metrics have a deterministic order even when the API reorders equal timestamps", () => {
  const entries = [match(1), match(3), match(2)];
  for (const key of MATCH_SORT_KEYS) {
    for (const dir of SORT_DIRS) {
      const sorted = sortMatches(entries, key, dir);
      assert.deepEqual(
        sorted.map((entry) => entry.match_id),
        [3, 2, 1],
      );
      assert.deepEqual(sorted, sortMatches([...entries].reverse(), key, dir));
    }
  }
  assert.deepEqual(
    entries.map((entry) => entry.match_id),
    [1, 3, 2],
    "cached history must not be reordered",
  );
});

test("filtered history orders equal timestamps consistently with the default date sort", () => {
  const entries = [match(1), match(3), match(2, { start_time: 2000 })];
  const filtered = filterMatches(entries, { mode: "normal_all", heroId: null, result: "all" });
  assert.deepEqual(filtered, sortMatches(entries, "played", "desc"));
  assert.deepEqual(
    filtered.map((entry) => entry.match_id),
    [2, 3, 1],
  );
});
