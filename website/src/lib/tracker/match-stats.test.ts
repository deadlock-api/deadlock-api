import assert from "node:assert/strict";
import { test } from "node:test";

import type { PlayerMatchHistoryEntry } from "deadlock_api_client";

import type { TrackerMatchStat } from "~/queries/tracker-queries";

import {
  type LaneTimeline,
  laneStateOf,
  metricSeries,
  rollingMean,
  type StatMatch,
  summarizeLanes,
  summarizeMetric,
  TREND_METRICS,
  trendMetricsFor,
} from "./match-stats";

const stat = (time: number, souls: number, creepKills = 0) =>
  ({ time_stamp_s: time, net_worth: souls, creep_kills: creepKills }) as TrackerMatchStat;
const laner = (id: number, team: string, heroId: number, stats: TrackerMatchStat[]): LaneTimeline => ({
  account_id: id,
  team,
  hero_id: heroId,
  stats,
});
const entry = (matchId: number, time: number, won: boolean) =>
  ({
    match_id: matchId,
    start_time: time,
    player_team: 0,
    match_result: won ? 0 : 1,
    match_duration_s: 1800,
  }) as PlayerMatchHistoryEntry;
const laneMatch = (matchId: number, diff: number, won: boolean, enemyHeroIds = [7, 8], lane = 1): StatMatch => ({
  entry: entry(matchId, matchId, won),
  stats: {
    match_id: matchId,
    player_damage: 0,
    player_damage_taken: 0,
    boss_damage: 0,
    healing: 0,
    shots_hit: 0,
    shots_missed: 0,
    hero_bullets_hit: 0,
    hero_bullets_hit_crit: 0,
    neutral_souls: 0,
    souls_lost: 0,
    lane: { lane, diff, own: stat(540, 5000, 30), enemyHeroIds },
  },
});

test("a lane is read at nine minutes, summed per side, from the tracked player's side", () => {
  const laners = [
    laner(1, "Team0", 10, [stat(360, 3000), stat(540, 6000), stat(720, 9000)]),
    laner(2, "Team0", 11, [stat(540, 5000)]),
    laner(3, "Team1", 12, [stat(540, 5500)]),
    laner(4, "Team1", 13, [stat(540, 4500)]),
  ];
  const state = laneStateOf(laners, 1, 4, 1800);
  assert.equal(state?.diff, 1000);
  assert.equal(state?.own.net_worth, 6000);
  assert.deepEqual(state?.enemyHeroIds, [12, 13]);
  assert.equal(laneStateOf(laners, 3, 4, 1800)?.diff, -1000);
});

test("no lane state without a lane, an opponent, the tracked player, or a laning phase", () => {
  const laners = [laner(1, "Team0", 10, [stat(540, 6000)]), laner(3, "Team1", 12, [stat(540, 5500)])];
  assert.equal(laneStateOf(laners, 1, 0, 1800), null);
  assert.equal(laneStateOf(laners, 1, 1, 500), null);
  assert.equal(laneStateOf(laners, 9, 1, 1800), null);
  assert.equal(laneStateOf(laners.slice(0, 1), 1, 1, 1800), null);
  // A laner without a sample by nine minutes leaves the lane unknown rather than counted as zero souls.
  assert.equal(laneStateOf([...laners, laner(4, "Team1", 13, [stat(600, 7000)])], 1, 1, 1800), null);
});

test("rolling means start once a window is full", () => {
  const series = [1, 2, 3, 4, 5].map((value, i) => ({ matchId: i, time: i, value }));
  assert.deepEqual(
    rollingMean(series, 2).map((point) => point.value),
    [1.5, 2.5, 3.5, 4.5],
  );
  assert.deepEqual(rollingMean(series, 6), []);
});

test("a metric compares its latest window with the one before, never with a tiny baseline", () => {
  const series = Array.from({ length: 15 }, (_, i) => ({ matchId: i, time: i, value: i < 5 ? 0 : i < 10 ? 1 : 3 }));
  assert.deepEqual(summarizeMetric(series, 5), { overall: 20 / 15, recent: 3, previous: 1, readings: 15 });
  assert.equal(summarizeMetric(series.slice(0, 8), 5).previous, null);
});

test("metric series skip matches without the stat and run oldest first", () => {
  const laneWon = TREND_METRICS.find((metric) => metric.key === "lane_won");
  assert.ok(laneWon);
  const noStats: StatMatch = { entry: entry(5, 5, true), stats: undefined };
  const series = metricSeries([laneMatch(3, -100, false), noStats, laneMatch(1, 200, true)], laneWon);
  assert.deepEqual(
    series.map((point) => [point.matchId, point.value]),
    [
      [1, 1],
      [3, 0],
    ],
  );
});

test("lane summary splits match results by lane outcome, lane and opponent", () => {
  const summary = summarizeLanes([
    laneMatch(1, 800, true, [7, 8]),
    laneMatch(2, 400, false, [7, 9]),
    laneMatch(3, -600, false, [7, 8], 4),
    { entry: entry(4, 4, true), stats: undefined },
  ]);
  assert.deepEqual(summary.all, { lanes: 3, won: 2, lost: 1, diffSum: 600, matchWins: 1 });
  assert.deepEqual(summary.afterWon, { matches: 2, wins: 1 });
  assert.deepEqual(summary.afterLost, { matches: 1, wins: 0 });
  assert.deepEqual(
    summary.byLane.map(({ lane, record }) => [lane.id, record.lanes]),
    [
      [1, 2],
      [4, 1],
      [6, 0],
    ],
  );
  assert.deepEqual(
    summary.byOpponent.map(({ heroId, record }) => [heroId, record.lanes]),
    [
      [7, 3],
      [8, 2],
      [9, 1],
    ],
  );
});

test("Street Brawl offers neither lanes nor soul rates", () => {
  const keys = trendMetricsFor(false, false).map((metric) => metric.key);
  assert.ok(!keys.some((key) => key.startsWith("lane_")));
  assert.ok(!keys.includes("souls_per_min"));
  assert.ok(keys.includes("accuracy"));
});
