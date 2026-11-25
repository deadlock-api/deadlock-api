import assert from "node:assert/strict";
import { test } from "node:test";

import type { PlayerMatchHistoryEntry } from "deadlock_api_client";

import {
  computeOutcomeSplits,
  computePerformanceTrend,
  computeStreaks,
  isLoss,
  isWin,
  playerResult,
  recentForm,
  summarize,
  teamWon,
} from "./compute";

const WIN = 1;
const LOSS = 2;
const PENALIZED = 3;
const PENALIZED_PARTY = 4;
const NOT_SCORED = 5;

function match(id: number, outcome: number, teamWonMatch: boolean): PlayerMatchHistoryEntry {
  return {
    account_id: 1,
    match_id: id,
    start_time: id * 3600,
    hero_id: 1,
    hero_level: 20,
    game_mode: 1,
    match_mode: 4,
    player_team: 0,
    match_result: teamWonMatch ? 0 : 1,
    player_match_outcome: outcome,
    player_kills: 5,
    player_deaths: 2,
    player_assists: 5,
    net_worth: 20000,
    match_duration_s: 1800,
    last_hits: 100,
    denies: 5,
    objectives_mask_team0: 0,
    objectives_mask_team1: 0,
  };
}

test("the player's outcome decides the result; matches before the outcome existed follow the team", () => {
  assert.equal(playerResult(match(1, WIN, true)), "win");
  assert.equal(playerResult(match(2, LOSS, false)), "loss");
  // A leaver loses rank even when the team wins.
  assert.equal(playerResult(match(3, PENALIZED, true)), "loss");
  assert.equal(playerResult(match(4, PENALIZED_PARTY, true)), "loss");
  // Voided after a teammate left: no result, whatever the team did.
  assert.equal(playerResult(match(5, NOT_SCORED, false)), "not_scored");
  assert.equal(playerResult(match(6, 0, true)), "win");
  assert.equal(playerResult(match(7, 0, false)), "loss");
  assert.equal(teamWon(match(3, PENALIZED, true)), true);
  const voided = match(8, NOT_SCORED, false);
  assert.equal(isWin(voided), false);
  assert.equal(isLoss(voided), false);
});

test("not-scored matches stay out of win rates, form and streaks; penalized ones count as losses", () => {
  // Newest first.
  const entries = [
    match(6, NOT_SCORED, false),
    match(5, WIN, true),
    match(4, NOT_SCORED, false),
    match(3, WIN, true),
    match(2, PENALIZED, true),
    match(1, LOSS, false),
  ];
  const summary = summarize(entries);
  assert.equal(summary.matches, 6);
  assert.equal(summary.wins, 2);
  assert.equal(summary.losses, 2);
  assert.equal(summary.winrate, 0.5);
  assert.deepEqual(recentForm(entries, 3), ["win", "win", "loss"]);
  assert.deepEqual(computeStreaks(entries), { current: 2, longestWin: 2, longestLoss: 2 });
  const sides = computeOutcomeSplits(entries).bySide;
  assert.equal(sides[0].matches, 4);
  assert.equal(sides[0].wins, 2);
});

test("the rolling win rate divides by the scored matches of the window", () => {
  const entries = [match(1, WIN, true), match(2, NOT_SCORED, false), match(3, LOSS, false), match(4, WIN, true)];
  assert.deepEqual(
    computePerformanceTrend(entries, 2).map((point) => point.winrate),
    [1, 0, 0.5],
  );
});
