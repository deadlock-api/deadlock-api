import assert from "node:assert/strict";
import { test } from "node:test";

import type { PlayerMatchHistoryEntry } from "deadlock_api_client";

import { filterMatches, type TrackerFilterValues } from "./compute";
import { filterRecoveryOptions } from "./filter-recovery";

const defaults: TrackerFilterValues = { mode: "normal_all", heroId: null, result: "all" };
function match(id: number, overrides: Partial<PlayerMatchHistoryEntry> = {}): PlayerMatchHistoryEntry {
  return {
    match_id: id,
    start_time: id * 100,
    game_mode: 1,
    match_mode: 1,
    hero_id: 1,
    player_team: 0,
    match_result: 0,
    ...overrides,
  } as PlayerMatchHistoryEntry;
}

test("offers all dates for an inactive player while preserving hero, mode and result", () => {
  const filters: TrackerFilterValues = { ...defaults, heroId: 1, result: "win", minUnixTimestamp: 1000 };
  const entries = [match(1), match(2), match(3, { hero_id: 2 }), match(4, { match_result: 1 })];
  const options = filterRecoveryOptions(entries, filters);
  assert.equal(options.length, 1);
  assert.equal(options[0].label, "Show all dates");
  assert.equal(options[0].matches, 2);
  assert.deepEqual(options[0].filters, { ...filters, minUnixTimestamp: null, maxUnixTimestamp: null });
});

test("suggests individual hero and result changes with their own accurate counts", () => {
  const filters: TrackerFilterValues = { ...defaults, heroId: 2, result: "loss" };
  const options = filterRecoveryOptions([match(1, { match_result: 1 }), match(2, { hero_id: 2 })], filters);
  assert.deepEqual(
    options.map(({ label, matches }) => [label, matches]),
    [
      ["Show all heroes", 1],
      ["Include wins and losses", 1],
    ],
  );
  assert.equal(options[0].filters.result, "loss");
  assert.equal(options[1].filters.heroId, 2);
});

test("broadens ranked or unranked without mixing Brawl into normal statistics", () => {
  const options = filterRecoveryOptions([match(1), match(2, { game_mode: 4 })], {
    ...defaults,
    mode: "normal_ranked",
  });
  assert.deepEqual(
    options.map(({ label, matches }) => [label, matches]),
    [
      ["Include ranked and unranked", 1],
      ["Switch to Brawl", 1],
    ],
  );
});

test("when multiple filters exclude the history, offers explicit all-time fallbacks in the current mode first", () => {
  const entries = [match(1), match(2, { game_mode: 4 }), match(3, { game_mode: 4 })];
  const filters: TrackerFilterValues = {
    mode: "street_brawl",
    heroId: 9,
    result: "loss",
    minUnixTimestamp: 1000,
  };
  const options = filterRecoveryOptions(entries, filters);
  assert.deepEqual(
    options.map(({ label, matches }) => [label, matches]),
    [
      ["Show all Brawl matches", 2],
      ["Show all normal matches", 1],
    ],
  );
  for (const option of options) {
    assert.equal(option.filters.heroId, null);
    assert.equal(option.filters.result, "all");
    assert.equal(option.filters.minUnixTimestamp, null);
    assert.equal(option.filters.maxUnixTimestamp, null);
  }
});

test("offers no false recovery for empty history or unsupported match types", () => {
  assert.deepEqual(filterRecoveryOptions([], defaults), []);
  assert.deepEqual(filterRecoveryOptions([match(1, { match_mode: 6 })], defaults), []);
});

test("honors an upper date bound, including zero, and never mutates filters or cached entries", () => {
  const entries = [match(2), match(1)];
  const filters = { ...defaults, maxUnixTimestamp: 0 };
  const originalEntries = structuredClone(entries);
  const originalFilters = { ...filters };
  const options = filterRecoveryOptions(entries, filters);
  assert.equal(options[0].label, "Show all dates");
  for (const option of options) assert.equal(filterMatches(entries, option.filters).length, option.matches);
  assert.deepEqual(entries, originalEntries);
  assert.deepEqual(filters, originalFilters);
});
