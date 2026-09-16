import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  TrackerMatchDeath,
  TrackerMatchMetadata,
  TrackerMatchPlayer,
  TrackerPlayerDeaths,
} from "~/queries/tracker-queries";

import { computeFights, timeDeadInMatch } from "./fights";
import { playerContext } from "./player-stats";

const death = (time: number, duration: number, killer: number | null = null): TrackerMatchDeath => ({
  game_time_s: time,
  death_duration_s: duration,
  killer_player_slot: killer,
  time_to_kill_s: 3,
});

test("time dead stops at match end instead of counting the full respawn timer", () => {
  // Recorded final death in match 103841923: a 66-second timer with 19 seconds left.
  assert.equal(timeDeadInMatch(death(1736, 66), 1755), 19);
  assert.equal(timeDeadInMatch(death(100, 30), 1755), 30);
  assert.equal(timeDeadInMatch(death(1755, 66), 1755), 0);
  assert.equal(timeDeadInMatch(death(1800, 66), 1755), 0);
  assert.equal(timeDeadInMatch(death(-10, 30), 1755), 20);
  assert.equal(timeDeadInMatch(death(100, -5), 1755), 0);
});

test("fight summaries distinguish respawns from deaths that last until match end", () => {
  const players = [{ account_id: 1 }, { account_id: 2 }] as TrackerMatchPlayer[];
  const rows: TrackerPlayerDeaths[] = [
    { account_id: 1, player_slot: 5, death_details: [death(1736, 66, 9), death(100, 30)] },
    { account_id: 2, player_slot: 9, death_details: [death(50, 10, 5)] },
  ];
  const before = structuredClone(rows);
  const summary = computeFights(rows, players, 1, 1755);
  assert.ok(summary);
  assert.equal(summary.deadForS, 49);
  assert.deepEqual(
    summary.deaths.map((d) => [d.time, d.deadForS, d.endedAtMatchEnd]),
    [
      [100, 30, false],
      [1736, 19, true],
    ],
  );
  assert.equal(summary.deaths[0].killer, null);
  assert.equal(summary.deaths[1].killer, players[1]);
  assert.deepEqual(summary.kills, [{ time: 50, victim: players[1] }]);
  assert.deepEqual(rows, before);
  assert.equal(computeFights(rows, players, 3, 1755), null);
});

test("scoreboard time dead uses the same match boundary and preserves missing records", () => {
  const player = {
    account_id: 1,
    team: "Team0",
    kills: 0,
    assists: 0,
    player_damage: 0,
    net_worth: 0,
  } as TrackerMatchPlayer;
  const match = {
    players: [player],
    deaths: [{ account_id: 1, player_slot: 5, death_details: [death(100, 30), death(1736, 66)] }],
  } as TrackerMatchMetadata;
  assert.equal(playerContext(match, player, 1755).deadForS, 49);
  match.deaths[0].death_details = [];
  assert.equal(playerContext(match, player, 1755).deadForS, 0);
  match.deaths = [];
  assert.equal(playerContext(match, player, 1755).deadForS, null);
});
