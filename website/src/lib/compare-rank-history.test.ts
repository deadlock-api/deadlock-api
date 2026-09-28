import assert from "node:assert/strict";
import { test } from "node:test";

import type { PlayerMatchHistoryEntry } from "deadlock_api_client";

import { dailyRanks, dayTicks, mergeRankSeries, rankAxis, rankByMatchNumber, utcDay } from "./compare-rank-history";

const DAY = 86_400;
const D0 = 1_700_006_400; // a UTC midnight

function match(matchId: number, startTime: number, badge: number | null): PlayerMatchHistoryEntry {
  return { match_id: matchId, start_time: startTime, ranked_display_badge: badge } as PlayerMatchHistoryEntry;
}

test("utcDay floors to the UTC midnight", () => {
  assert.equal(utcDay(D0 + 3600), D0);
  assert.equal(utcDay(D0), D0);
});

test("dailyRanks keeps the last rank of each day, oldest first, and skips unranked matches", () => {
  const days = dailyRanks([
    match(5, D0 + DAY + 100, 0),
    match(4, D0 + DAY + 50, 72),
    match(3, D0 + 500, 63),
    match(2, D0 + 100, null),
    match(1, D0 + 10, 61),
  ]);
  assert.deepEqual(days, [
    { day: D0, badge: 63, linear: 33 },
    { day: D0 + DAY, badge: 72, linear: 38 },
  ]);
});

test("mergeRankSeries holds a rank between close days and breaks across long absences", () => {
  const a = [
    { day: D0, badge: 61, linear: 31 },
    { day: D0 + 2 * DAY, badge: 62, linear: 32 },
    { day: D0 + 30 * DAY, badge: 63, linear: 33 },
  ];
  const b = [{ day: D0 + DAY, badge: 71, linear: 37 }];
  const rows = mergeRankSeries([
    { key: "a", days: a },
    { key: "b", days: b },
  ]);
  assert.deepEqual(
    rows.map((r) => r.day),
    [D0, D0 + DAY, D0 + 2 * DAY, D0 + 3 * DAY, D0 + 30 * DAY],
  );
  assert.deepEqual(
    rows.map((r) => r.linear.a),
    [31, 31, 32, null, 33],
  );
  assert.deepEqual(
    rows.map((r) => r.played.a),
    [true, false, true, false, true],
  );
  // b plays once: a lone dot, a gap everywhere else, and its badge carries forward only after its day.
  assert.deepEqual(
    rows.map((r) => r.linear.b),
    [null, 37, null, null, null],
  );
  assert.deepEqual(
    rows.map((r) => r.lone.b),
    [false, true, false, false, false],
  );
  assert.deepEqual(
    rows.map((r) => r.badge.b),
    [null, 71, 71, 71, 71],
  );
  // a's last day is 28 days after the one before: a gap in the line, drawn as a lone dot.
  assert.equal(rows[4].lone.a, true);
  assert.equal(rows[0].lone.a, false);
});

test("mergeRankSeries leaves a long absence between two ranked days empty", () => {
  const rows = mergeRankSeries([
    { key: "a", days: [{ day: D0, badge: 61, linear: 31 }] },
    {
      key: "b",
      days: [
        { day: D0 - 20 * DAY, badge: 71, linear: 37 },
        { day: D0 + 20 * DAY, badge: 72, linear: 38 },
      ],
    },
  ]);
  assert.deepEqual(
    rows.map((r) => r.day),
    [D0 - 20 * DAY, D0 - 19 * DAY, D0, D0 + 20 * DAY],
  );
  assert.equal(rows[2].linear.b, null);
  assert.equal(rows[2].badge.b, 71);
});

test("rankAxis ticks tier starts, or subtiers inside one tier", () => {
  assert.deepEqual(rankAxis([31, 45]), { domain: [30, 46], ticks: [31, 37, 43] });
  assert.deepEqual(rankAxis([33, 34]), { domain: [32, 35], ticks: [32, 33, 34, 35] });
  assert.deepEqual(rankAxis([1]).domain, [1, 2]);
  assert.deepEqual(rankAxis([66]).domain, [65, 66]);
});

test("dayTicks spreads UTC days over the range", () => {
  assert.deepEqual(dayTicks(D0 + 5, D0 + 8 * DAY + 5, 5), [D0, D0 + 2 * DAY, D0 + 4 * DAY, D0 + 6 * DAY, D0 + 8 * DAY]);
  assert.deepEqual(dayTicks(D0, D0 + 100), [D0]);
});

test("rankByMatchNumber lines series up by match number and ends each where it ends", () => {
  const point = (linear: number) => ({ badge: linear, linear });
  const rows = rankByMatchNumber([
    { key: "a", points: [point(1), point(2), point(3)] },
    { key: "b", points: [point(5)] },
  ]);
  assert.deepEqual(
    rows.map((row) => row.match),
    [1, 2, 3],
  );
  assert.equal(rows[0].linear.b, 5);
  assert.equal(rows[1].linear.b, null);
  assert.equal(rows[2].linear.a, 3);
});

test("rankByMatchNumber samples long histories, keeping every series' last match", () => {
  const long = Array.from({ length: 1000 }, (_, index) => ({ badge: index, linear: index }));
  const rows = rankByMatchNumber([
    { key: "a", points: long },
    { key: "b", points: long.slice(0, 457) },
  ]);
  assert.ok(rows.length <= 302);
  assert.ok(rows.some((row) => row.match === 1000));
  assert.ok(rows.some((row) => row.match === 457));
  assert.deepEqual(rankByMatchNumber([]), []);
});
