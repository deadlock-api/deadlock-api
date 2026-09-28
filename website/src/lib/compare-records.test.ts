import assert from "node:assert/strict";
import { test } from "node:test";

import type { PlayerMatchHistoryEntry } from "deadlock_api_client";

import {
  matchesByHour,
  matchesByWeekday,
  MIN_BRACKET_MATCHES,
  playerRecords,
  RECORD_MIN_DURATION_S,
  winRateByDuration,
} from "./compare-records";

const DAY = 86_400;

let nextId = 1;
function match(startTime: number, overrides: Partial<PlayerMatchHistoryEntry> = {}): PlayerMatchHistoryEntry {
  return {
    match_id: nextId++,
    hero_id: 1,
    start_time: startTime,
    match_result: 0,
    player_team: 0,
    player_kills: 4,
    player_deaths: 2,
    player_assists: 6,
    net_worth: 30_000,
    last_hits: 150,
    match_duration_s: 1800,
    ...overrides,
  } as PlayerMatchHistoryEntry;
}

test("playerRecords finds each best match, the earlier one on a tie", () => {
  const records = playerRecords([
    match(3 * DAY, { player_kills: 12, hero_id: 7 }),
    match(2 * DAY, { player_kills: 12, hero_id: 8, net_worth: 50_000 }),
    match(DAY, { player_assists: 20 }),
  ]);
  assert.equal(records.mostKills?.value, 12);
  assert.equal(records.mostKills?.heroId, 8);
  assert.equal(records.mostAssists?.value, 20);
  assert.equal(records.mostSouls?.value, 50_000);
  assert.equal(records.activeDays, 3);
  assert.equal(records.matches, 3);
});

test("playerRecords leaves short matches out of the per-minute record", () => {
  const records = playerRecords([
    match(DAY, { net_worth: 20_000, match_duration_s: 300 }),
    match(2 * DAY, { net_worth: 30_000, match_duration_s: RECORD_MIN_DURATION_S }),
  ]);
  assert.equal(Math.round(records.bestSoulsPerMin?.value ?? 0), 2000);
});

test("playerRecords streaks read newest first", () => {
  const win = { match_result: 0, player_team: 0 };
  const loss = { match_result: 1, player_team: 0 };
  const records = playerRecords([
    match(5 * DAY, loss),
    match(4 * DAY, loss),
    match(3 * DAY, win),
    match(2 * DAY, win),
    match(DAY, win),
  ]);
  assert.equal(records.currentStreak, -2);
  assert.equal(records.longestWinStreak, 3);
});

test("playerRecords without matches has no bests", () => {
  const records = playerRecords([]);
  assert.equal(records.mostKills, null);
  assert.equal(records.currentStreak, 0);
  assert.equal(records.activeDays, 0);
});

test("winRateByDuration buckets by minutes and hides thin brackets", () => {
  const short = Array.from({ length: MIN_BRACKET_MATCHES }, (_, i) =>
    match(i, { match_duration_s: 20 * 60, match_result: i === 0 ? 1 : 0 }),
  );
  const long = [match(100, { match_duration_s: 50 * 60 })];
  const brackets = winRateByDuration([...short, ...long]);
  assert.equal(brackets[0].matches, MIN_BRACKET_MATCHES);
  assert.equal(brackets[0].winRate, (MIN_BRACKET_MATCHES - 1) / MIN_BRACKET_MATCHES);
  assert.equal(brackets[1].matches, 0);
  assert.equal(brackets[3].matches, 1);
  assert.equal(brackets[3].winRate, null);
});

test("winRateByDuration puts a bracket's upper edge in the next bracket", () => {
  const brackets = winRateByDuration([match(0, { match_duration_s: 25 * 60 })], 1);
  assert.equal(brackets[0].matches, 0);
  assert.equal(brackets[1].matches, 1);
});

test("matchesByHour buckets start times by hour, UTC by default", () => {
  const hours = matchesByHour([
    match(3 * 3600 + 59),
    match(DAY + 3 * 3600, { match_result: 1 }),
    match(23 * 3600 + 3599),
  ]);
  assert.equal(hours.length, 24);
  assert.deepEqual(hours[3], { hour: 3, matches: 2, wins: 1 });
  assert.equal(hours[23].matches, 1);
  const shifted = matchesByHour([match(0)], () => 5);
  assert.equal(shifted[5].matches, 1);
});

test("matchesByWeekday starts the week on Monday, UTC by default", () => {
  // 1970-01-05 was a Monday.
  // The epoch itself, 1970-01-01, was a Thursday.
  const days = matchesByWeekday([match(4 * DAY + 10), match(0)]);
  assert.equal(days[0].matches, 1);
  assert.equal(days[3].matches, 1);
});
