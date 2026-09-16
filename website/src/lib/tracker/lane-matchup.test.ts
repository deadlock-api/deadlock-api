import assert from "node:assert/strict";
import { test } from "node:test";

import type { TrackerMatchPlayer, TrackerMatchStat } from "~/queries/tracker-queries";

import { computeLaneMatchups } from "./lane-matchup";

const stat = (time: number, souls: number) => ({ time_stamp_s: time, net_worth: souls }) as TrackerMatchStat;
const player = (id: number, team: string, lane: number, stats: TrackerMatchStat[]) =>
  ({ account_id: id, team, assigned_lane: lane, stats }) as TrackerMatchPlayer;

test("lane comparison uses the latest sample before nine minutes and keeps the tracked player first", () => {
  const players = [
    player(1, "Team0", 1, [stat(600, 9000), stat(540, 6000), stat(300, 2000)]),
    player(2, "Team0", 1, [stat(540, 5000)]),
    player(3, "Team1", 1, [stat(540, 5500)]),
    player(4, "Team1", 1, [stat(540, 4500)]),
  ];
  const before = structuredClone(players);
  const [lane] = computeLaneMatchups(players, 2);
  assert.equal(lane.time, 540);
  assert.equal(lane.diff, 1000);
  assert.deepEqual(
    lane.own.map((row) => row.player.account_id),
    [2, 1],
  );
  assert.equal(lane.own[1].stat?.net_worth, 6000);
  assert.equal(computeLaneMatchups(players, 3)[0].diff, -1000);
  assert.deepEqual(players, before);
});

test("a missing laner's sample makes the comparison unknown instead of inventing zero souls", () => {
  const players = [
    player(1, "Team0", 1, [stat(540, 5000)]),
    player(2, "Team1", 1, []),
    player(3, "Team1", 1, [stat(600, 7000)]),
    player(4, "Team0", 4, [stat(540, 0)]),
    player(5, "Team1", 4, [stat(540, 0)]),
  ];
  const [unknown, recordedZero] = computeLaneMatchups(players, 1);
  assert.equal(unknown.diff, null);
  assert.ok(unknown.enemy.every((row) => row.stat === null));
  assert.equal(recordedZero.diff, 0, "recorded zero values remain a known tie");
  assert.equal(recordedZero.own[0].stat?.net_worth, 0);
});

test("short matches use their last available time and retain each sample's actual timestamp", () => {
  const players = [
    player(1, "Team0", 1, [stat(270, 2500)]),
    player(2, "Team1", 1, [stat(240, 2000)]),
    player(3, "Team0", 6, [stat(270, 3000)]),
  ];
  const lanes = computeLaneMatchups(players, 1);
  assert.equal(lanes.length, 1, "a lane without opponents has no comparison");
  assert.equal(lanes[0].time, 270);
  assert.equal(lanes[0].enemy[0].stat?.time_stamp_s, 240);
  assert.equal(lanes[0].diff, 500);
  assert.deepEqual(computeLaneMatchups(players, 99), []);
  assert.deepEqual(computeLaneMatchups([player(1, "Team0", 1, [])], 1), []);
});
