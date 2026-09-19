import assert from "node:assert/strict";
import { test } from "node:test";

import {
  type HeroTrendPoint,
  buildHeroTrendPoints,
  formatTrendChange,
  formatTrendValue,
  heroTrendsCsv,
  summarizeHeroTrend,
} from "./hero-trends";

const start = Date.UTC(2026, 8, 1) / 1000;

test("omitted intervals and filtered buckets remain gaps without inventing zero values", () => {
  const points = buildHeroTrendPoints(
    {
      [start]: [[1, 51.25, 100]],
      [start + 86400]: [],
      [start + 4 * 86400]: [[1, 53.5, 200]],
    },
    "start_time_day",
  );
  assert.deepEqual(
    points.map((point) => point.date),
    [start, start + 86400, start + 2 * 86400, start + 4 * 86400].map((date) => date * 1000),
  );
  assert.equal(points[1][1], undefined);
  assert.equal(points[2][1], undefined);
  assert.equal(summarizeHeroTrend(points, 1)?.change, 2.25);
  assert.equal(summarizeHeroTrend(points, 1)?.buckets, 2);
});

test("hourly and weekly intervals are respected, and per-match precision survives chart preparation", () => {
  for (const [interval, step] of [
    ["start_time_hour", 3600],
    ["start_time_week", 604800],
  ] as const) {
    const points = buildHeroTrendPoints(
      { [start]: [[1, 1234.567, 20]], [start + step]: [[1, 1235.789, 30]] },
      interval,
    );
    assert.equal(points.length, 2);
    assert.equal(points[0][1], 1234.567);
    assert.equal(formatTrendValue(points[0][1], "net_worth_per_match"), "1,234.57");
  }
});

test("summaries use each hero's own first and latest data and do not claim a change for one sample", () => {
  const points: HeroTrendPoint[] = [
    { date: start * 1000, 1: 0, "1_matches": 15 },
    { date: (start + 86400) * 1000, 2: 45, "2_matches": 100 },
    { date: (start + 2 * 86400) * 1000, 1: 5, "1_matches": 20 },
  ];
  assert.deepEqual(summarizeHeroTrend(points, 1), {
    heroId: 1,
    firstDate: start * 1000,
    latestDate: (start + 2 * 86400) * 1000,
    firstValue: 0,
    latestValue: 5,
    change: 5,
    buckets: 2,
    latestMatches: 20,
  });
  assert.equal(summarizeHeroTrend(points, 2)?.change, null);
  assert.equal(summarizeHeroTrend(points, 99), null);
  assert.equal(formatTrendChange(2.25, "winrate"), "+2.25 pp");
  assert.equal(formatTrendChange(-5, "matches"), "-5");
  assert.equal(formatTrendChange(-0.00001, "ban_rate"), "0 pp");
});

test("CSV exports selected heroes, UTC dates, zeros and raw values while excluding gaps and non-finite data", () => {
  const points = buildHeroTrendPoints(
    {
      [start]: [
        [1, 0, 20],
        [2, 70, 100],
        [3, Number.NaN, 0],
      ],
      [start + 86400]: [],
      [start + 2 * 86400]: [[1, 5.123456, 30]],
    },
    "start_time_day",
  );
  const csv = heroTrendsCsv(points, [{ id: 1, name: 'A, "hero"' }], "winrate", "start_time_day");
  const lines = csv.split("\r\n");
  assert.equal(lines.length, 3);
  assert.match(lines[1], /"2026-09-01T00:00:00.000Z","1","A, ""hero""","winrate","0","20"/);
  assert.match(lines[2], /"5.123456","30","start_time_day"/);
  assert.equal(points[0][3], undefined);
});
