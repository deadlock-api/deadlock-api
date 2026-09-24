import assert from "node:assert/strict";
import { test } from "node:test";

import type { HeroCounterStats, LaneMatchupStats } from "deadlock_api_client";

import { laneRows, StatsIndex } from "./analysis";

const draft = {
  gameMode: "normal" as const,
  ally: [1, 2, null, null, null, null],
  enemy: [3, 4, null, null, null, null],
};

const duel = (hero: number, enemy: number, matches: number) =>
  ({ hero_id: hero, enemy_hero_id: enemy, wins: matches / 2, matches_played: matches }) as HeroCounterStats;
const laneCounters = [duel(1, 3, 500), duel(1, 4, 800), duel(2, 3, 300), duel(2, 4, 900)];

const duoGames = (matches: number) =>
  ({
    assigned_lane: 1,
    hero_ids: [1, 2],
    enemy_hero_ids: [3, 4],
    wins: matches / 2,
    matches_played: matches,
  }) as LaneMatchupStats;

test("a lane with enough duo games reports those games as its source", () => {
  const index = new StatsIndex("normal", [], [], [], laneCounters, [duoGames(36)]);
  const [yellow] = laneRows(draft, index);
  assert.equal(yellow.source, "duo");
  assert.equal(yellow.matches, 36);
});

test("a lane short of duo games is marked as a 1v1 estimate with its thinnest matchup", () => {
  const index = new StatsIndex("normal", [], [], [], laneCounters, [duoGames(5)]);
  const [yellow] = laneRows(draft, index);
  assert.equal(yellow.source, "matchups");
  assert.equal(yellow.matches, 300);
  assert.equal(yellow.winRate, 0.5);
});

test("an incomplete or unmeasured lane has no source", () => {
  const [, blue] = laneRows(draft, new StatsIndex("normal", [], [], [], laneCounters, []));
  assert.equal(blue.source, undefined);
  assert.equal(blue.matches, 0);
});
