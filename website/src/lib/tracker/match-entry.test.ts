import assert from "node:assert/strict";
import { test } from "node:test";

import type { MatchSummary, MatchSummaryPlayer } from "~/queries/tracker-queries";

import { historyEntryOf } from "./match-entry";

const player = (account_id: number, team: string, extra: Partial<MatchSummaryPlayer> = {}): MatchSummaryPlayer => ({
  account_id,
  team,
  hero_id: 6,
  player_level: 30,
  kills: 9,
  deaths: 2,
  assists: 14,
  net_worth: 41000,
  last_hits: 150,
  denies: 4,
  abandon_match_time_s: null,
  player_match_outcome: "Win",
  rank_badge: 101,
  rank_delta: 120,
  demotion_protected: false,
  calibration: false,
  ...extra,
});

const summary: MatchSummary = {
  match_id: 114528806,
  start_time: 1_790_000_000,
  duration_s: 600,
  match_mode: "Ranked",
  game_mode: "StreetBrawl",
  winning_team: "Team1",
  average_badge_team0: null,
  average_badge_team1: null,
  team_score: [1, 3],
  round_durations_s: [72, 81, 88, 99],
  players: [
    player(1, "Team0", { player_match_outcome: "Loss" }),
    player(2, "Team1", { player_match_outcome: "NotScored" }),
  ],
};

test("a stored match reads as the player's history entry, in the history's enum numbers", () => {
  const entry = historyEntryOf(summary, 2);
  assert.ok(entry);
  assert.equal(entry.game_mode, 4);
  assert.equal(entry.match_mode, 4);
  assert.equal(entry.player_team, 1);
  assert.equal(entry.match_result, 1);
  assert.equal(entry.player_match_outcome, 5);
  assert.deepEqual([entry.brawl_score_team0, entry.brawl_score_team1], [1, 3]);
  assert.equal(entry.brawl_avg_round_time_s, 85);
  assert.deepEqual([entry.player_kills, entry.player_deaths, entry.player_assists], [9, 2, 14]);
});

test("a player who was not in the match has no entry", () => {
  assert.equal(historyEntryOf(summary, 3), undefined);
});
