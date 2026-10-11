import assert from "node:assert/strict";
import { test } from "node:test";

import type { Rank } from "deadlock_api_client";

import type { MatchSummary, MatchSummaryPlayer } from "~/queries/tracker-queries";

import { matchShare, matchShareText } from "./match-share";

const player = (team: string, kills: number): MatchSummaryPlayer => ({
  account_id: 1,
  team,
  hero_id: 1,
  player_level: 30,
  kills,
  deaths: 0,
  assists: 0,
  net_worth: 0,
  last_hits: 0,
  denies: 0,
  abandon_match_time_s: null,
  player_match_outcome: "Win",
  rank_badge: null,
  rank_delta: null,
  demotion_protected: false,
  calibration: false,
});

const summary = (overrides: Partial<MatchSummary> = {}): MatchSummary => ({
  match_id: 42,
  start_time: 0,
  duration_s: 2050,
  match_mode: "Ranked",
  game_mode: "Normal",
  winning_team: "Team1",
  average_badge_team0: 74,
  average_badge_team1: 81,
  team_score: null,
  round_durations_s: [],
  players: [player("Team0", 20), player("Team0", 18), player("Team1", 25), player("Team1", 20)],
  ...overrides,
});

const ranks = [
  { tier: 7, name: "Oracle", images: {} },
  { tier: 8, name: "Phantom", images: {} },
] as unknown as Rank[];

test("the winner's kills come first, and the ranks average on the linear scale", () => {
  const text = matchShareText(42, summary(), ranks);
  assert.equal(text.title, "Match 42: The Archmother Won");
  assert.equal(
    text.description,
    "The Archmother beat The Hidden King 45 to 38 kills in 34 minutes. Ranked, average rank Oracle 6. Builds, kills and the soul lead for every player.",
  );
});

test("Street Brawl tells its round score, and a match without a winner names both sides", () => {
  const brawl = matchShare(summary({ game_mode: "StreetBrawl", team_score: [3, 1], winning_team: "Team0" }));
  assert.deepEqual([brawl.score, brawl.scoreUnit, brawl.mode, brawl.winner], [[3, 1], "rounds", "Street Brawl", 0]);
  const text = matchShareText(
    42,
    summary({ winning_team: "", average_badge_team0: null, average_badge_team1: null }),
    ranks,
  );
  assert.equal(text.title, "Deadlock Match 42");
  assert.match(text.description, /^The Hidden King and The Archmother, 38 to 45 kills in 34 minutes\. Ranked\. /);
});

test("without team averages the players' ranks make the average", () => {
  const players = [player("Team0", 1), player("Team1", 1)].map((entry, index) => ({
    ...entry,
    rank_badge: [74, 81][index],
  }));
  const share = matchShare(summary({ average_badge_team0: null, average_badge_team1: null, players }));
  assert.equal(share.averageBadge, 76);
});
