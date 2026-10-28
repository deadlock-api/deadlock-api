import assert from "node:assert/strict";
import { test } from "node:test";

import type { PlayerMatchHistoryEntry } from "deadlock_api_client";

import { computeHeroMatchups, differsFromBaseline, rankHeroes, rankingMinimum, teamsByMatch } from "./hero-matchups";

function match(id: number, team: number, winner: number, heroId: number): PlayerMatchHistoryEntry {
  return { match_id: id, player_team: team, match_result: winner, hero_id: heroId } as PlayerMatchHistoryEntry;
}

test("player rows group into teams, a duplicate row and an unknown team left out", () => {
  assert.deepEqual(
    teamsByMatch([
      { match_id: 1, team: "Team0", hero_id: 7 },
      { match_id: 1, team: "Team0", hero_id: 7 },
      { match_id: 1, team: "Team1", hero_id: 8 },
      { match_id: 1, team: "Spectator", hero_id: 9 },
      { match_id: 2, team: "Team1", hero_id: 0 },
    ]),
    { 1: [[7], [8]] },
  );
});

test("allies leave out the tracked player's own hero, enemies may share it", () => {
  const { rows, matches, wins } = computeHeroMatchups([match(1, 0, 0, 7), match(2, 1, 0, 7)], {
    1: [
      [7, 10],
      [7, 11],
    ],
    2: [[10], [7, 11]],
  });
  assert.equal(matches, 2);
  assert.equal(wins, 1);
  assert.deepEqual(rows, [
    { heroId: 7, with: { matches: 0, wins: 0, matchIds: [] }, against: { matches: 1, wins: 1, matchIds: [1] } },
    { heroId: 10, with: { matches: 1, wins: 1, matchIds: [1] }, against: { matches: 1, wins: 0, matchIds: [2] } },
    { heroId: 11, with: { matches: 1, wins: 0, matchIds: [2] }, against: { matches: 1, wins: 1, matchIds: [1] } },
  ]);
});

test("matches without stored players count nowhere", () => {
  const { rows, matches } = computeHeroMatchups([match(1, 0, 0, 7), match(2, 0, 1, 7)], { 1: [[7, 10], [11]] });
  assert.equal(matches, 1);
  assert.deepEqual(
    rows.map((row) => [row.heroId, row.with.matches, row.against.matches]),
    [
      [10, 1, 0],
      [11, 0, 1],
    ],
  );
});

test("ranking skips small samples and breaks ties with more games", () => {
  const row = (heroId: number, matches: number, wins: number) => ({
    heroId,
    with: { matches, wins, matchIds: [] },
    against: { matches: 0, wins: 0, matchIds: [] },
  });
  const rows = [row(1, 2, 2), row(2, 10, 6), row(3, 20, 12), row(4, 10, 3)];
  assert.deepEqual(
    rankHeroes(rows, "with", "best", 3, 2).map((r) => r.heroId),
    [3, 2],
  );
  assert.deepEqual(
    rankHeroes(rows, "with", "worst", 3, 1).map((r) => r.heroId),
    [4],
  );
  assert.deepEqual(rankHeroes(rows, "against", "best", 1, 3), []);
  assert.equal(rankingMinimum(40), 3);
  assert.equal(rankingMinimum(1000), 20);
});

test("a win rate differs from the baseline only beyond chance", () => {
  const tally = (matches: number, wins: number) => ({ matches, wins, matchIds: [] });
  assert.equal(differsFromBaseline(tally(60, 37), 0.56), false);
  assert.equal(differsFromBaseline(tally(60, 45), 0.56), true);
  assert.equal(differsFromBaseline(tally(600, 370), 0.56), true);
  assert.equal(differsFromBaseline(tally(0, 0), 0.56), false);
});
