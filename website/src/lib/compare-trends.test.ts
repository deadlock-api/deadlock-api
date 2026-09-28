import assert from "node:assert/strict";
import { test } from "node:test";

import type { PlayerMatchHistoryEntry } from "deadlock_api_client";

import { mergeWeeklyTrend, utcWeek, weeklyTotals, weekTicks, weekValue } from "./compare-trends";

const DAY = 86_400;
const WEEK = 7 * DAY;
const MONDAY = 1_700_438_400; // Monday 2023-11-20 00:00 UTC

function match(startTime: number, overrides: Partial<PlayerMatchHistoryEntry> = {}): PlayerMatchHistoryEntry {
  return {
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

test("utcWeek floors to Monday 00:00 UTC", () => {
  assert.equal(utcWeek(MONDAY), MONDAY);
  assert.equal(utcWeek(MONDAY + 6 * DAY + 86_399), MONDAY);
  assert.equal(utcWeek(MONDAY - 1), MONDAY - WEEK);
  assert.equal(new Date(utcWeek(1_700_000_000) * 1000).getUTCDay(), 1);
});

test("weeklyTotals sums each week, oldest first", () => {
  const weeks = weeklyTotals([
    match(MONDAY + WEEK + 10, { match_result: 1 }),
    match(MONDAY + 100),
    match(MONDAY + 200, { player_kills: 10 }),
  ]);
  assert.equal(weeks.length, 2);
  assert.deepEqual(
    weeks.map((w) => [w.week, w.matches, w.wins, w.kills]),
    [
      [MONDAY, 2, 2, 14],
      [MONDAY + WEEK, 1, 0, 4],
    ],
  );
});

test("weekValue pools the week's matches", () => {
  const [week] = weeklyTotals([
    match(MONDAY, { match_result: 1, player_deaths: 0 }),
    match(MONDAY + 1, { player_deaths: 4 }),
    match(MONDAY + 2, { player_deaths: 2, match_duration_s: 3600, net_worth: 60_000, last_hits: 300 }),
    match(MONDAY + 3, { match_result: 1 }),
  ]);
  assert.equal(weekValue(week, "winRate"), 0.5);
  assert.equal(weekValue(week, "kda"), (16 + 24) / 8);
  assert.equal(weekValue(week, "kills"), 4);
  assert.equal(weekValue(week, "deaths"), 2);
  // 150,000 souls over 150 minutes; 750 last hits over 150 minutes.
  assert.equal(weekValue(week, "soulsPerMin"), 1000);
  assert.equal(weekValue(week, "lastHitsPerMin"), 5);
});

test("weekValue: KDA without deaths is kills plus assists, per-minute rates need minutes", () => {
  const [week] = weeklyTotals([match(MONDAY, { player_deaths: 0, match_duration_s: 0 })]);
  assert.equal(weekValue(week, "kda"), 10);
  assert.equal(weekValue(week, "soulsPerMin"), null);
});

test("mergeWeeklyTrend fills every week, with gaps for thin or missing weeks, and marks lone points", () => {
  const three = (week: number) => [match(week), match(week + 1), match(week + 2)];
  const a = weeklyTotals([...three(MONDAY), ...three(MONDAY + WEEK), ...three(MONDAY + 4 * WEEK)]);
  const b = weeklyTotals([match(MONDAY + 2 * WEEK), match(MONDAY + 2 * WEEK + 1), ...three(MONDAY + 3 * WEEK)]);
  const rows = mergeWeeklyTrend(
    [
      { key: "a", weeks: a },
      { key: "b", weeks: b },
    ],
    "kills",
  );
  assert.deepEqual(
    rows.map((row) => row.week),
    [0, 1, 2, 3, 4].map((i) => MONDAY + i * WEEK),
  );
  assert.deepEqual(
    rows.map((row) => row.value.a),
    [4, 4, null, null, 4],
  );
  assert.deepEqual(
    rows.map((row) => row.value.b),
    [null, null, null, 4, null],
  );
  // A thin week is still counted, so the tooltip can say how many matches it had.
  assert.equal(rows[2].matches.b, 2);
  assert.deepEqual(
    rows.map((row) => [row.lone.a, row.lone.b]),
    [
      [false, false],
      [false, false],
      [false, false],
      [false, true],
      [true, false],
    ],
  );
});

test("mergeWeeklyTrend is empty without a week of enough matches", () => {
  assert.deepEqual(
    mergeWeeklyTrend([{ key: "a", weeks: weeklyTotals([match(MONDAY), match(MONDAY + 1)]) }], "kda"),
    [],
  );
  assert.deepEqual(mergeWeeklyTrend([], "kda"), []);
});

test("weekTicks steps in whole weeks", () => {
  assert.deepEqual(weekTicks(MONDAY, MONDAY), [MONDAY]);
  assert.deepEqual(
    weekTicks(MONDAY, MONDAY + 8 * WEEK),
    [0, 2, 4, 6, 8].map((i) => MONDAY + i * WEEK),
  );
  assert.deepEqual(
    weekTicks(MONDAY, MONDAY + 2 * WEEK),
    [0, 1, 2].map((i) => MONDAY + i * WEEK),
  );
});
