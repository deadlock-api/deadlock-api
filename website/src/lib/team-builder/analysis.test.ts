import assert from "node:assert/strict";
import { test } from "node:test";

import type { AnalyticsHeroStats, HeroCounterStats, LaneMatchupStats } from "deadlock_api_client";

import { analyzeDraft, laneRows, StatsIndex } from "./analysis";

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

const heroGames = (hero: number, winRate: number, matches: number) =>
  ({ hero_id: hero, wins: winRate * matches, matches }) as AnalyticsHeroStats;
const evenHeroes = new StatsIndex(
  "normal",
  Array.from({ length: 12 }, (_, i) => heroGames(i + 1, 0.5, 200_000)),
);
const board = (ally: (number | null)[], enemy: (number | null)[]) => ({ gameMode: "normal" as const, ally, enemy });

test("one side with nothing to face has no prediction", () => {
  const analysis = analyzeDraft(board([1, null, null, null, null, null], Array(6).fill(null)), evenHeroes);
  assert.equal(analysis.predicted, undefined);
  assert.equal(analysis.margin, undefined);
});

test("a one-against-one board is a guess, wider than a full one", () => {
  const oneEach = analyzeDraft(board([1, null, null, null, null, null], [7, null, null, null, null, null]), evenHeroes);
  const full = analyzeDraft(board([1, 2, 3, 4, 5, 6], [7, 8, 9, 10, 11, 12]), evenHeroes);
  assert.ok(oneEach.predicted !== undefined && full.predicted !== undefined);
  assert.ok((oneEach.margin ?? 0) > 10, `margin ${oneEach.margin}`);
  assert.ok((full.margin ?? Infinity) < (oneEach.margin ?? 0), `margin ${full.margin}`);
});
