import assert from "node:assert/strict";
import { test } from "node:test";

import type { HeroStats } from "deadlock_api_client";

import { type HeroRow, sortHeroRows, toHeroRow } from "./hero-performance";

function row(heroId: number, recentWinrate: number | null, matches = 10): HeroRow {
  return {
    heroId,
    matches,
    recentWinrate,
    winrate: 0.5,
    kda: 2,
    kills: 4,
    deaths: 3,
    assists: 2,
    soulsPerMin: 1000,
    dmgPerMin: 500,
    lastHitsPerMin: 3,
    lastPlayed: 1000,
  };
}

test("missing hero form stays after losses, mixed results and wins in both sort directions", () => {
  const rows = [row(1, null), row(2, 0), row(3, 0.5), row(4, 1), row(5, null, 20)];
  assert.deepEqual(
    sortHeroRows(rows, "recentWinrate", "asc").map((hero) => hero.heroId),
    [2, 3, 4, 5, 1],
  );
  assert.deepEqual(
    sortHeroRows(rows, "recentWinrate", "desc").map((hero) => hero.heroId),
    [4, 3, 2, 5, 1],
  );
  assert.deepEqual(
    rows.map((hero) => hero.heroId),
    [1, 2, 3, 4, 5],
    "sorting must not mutate its input",
  );
});

test("hero sorting breaks tied values by sample size then hero ID in both directions", () => {
  const rows = [row(3, 0.5), row(2, 0.5), row(1, 0.5, 20)];
  for (const direction of ["asc", "desc"] as const) {
    assert.deepEqual(
      sortHeroRows(rows, "recentWinrate", direction).map((hero) => hero.heroId),
      [1, 2, 3],
    );
    assert.deepEqual(
      sortHeroRows(rows, "winrate", direction).map((hero) => hero.heroId),
      [1, 2, 3],
    );
  }
  assert.deepEqual(
    sortHeroRows(rows, "matches", "asc").map((hero) => hero.heroId),
    [2, 3, 1],
  );
});

test("absent and empty recent history are missing form, while all losses remain a measured zero", () => {
  const stats = {
    hero_id: 1,
    matches_played: 0,
    wins: 0,
    kills: 0,
    deaths: 0,
    assists: 0,
    networth_per_min: 0,
    damage_per_min: 0,
    last_hits_per_min: 0,
    last_played: 1000,
  } as HeroStats;
  assert.equal(toHeroRow(stats, undefined).recentWinrate, null);
  assert.equal(toHeroRow(stats, []).recentWinrate, null);
  assert.equal(toHeroRow(stats, ["loss", "loss"]).recentWinrate, 0);
  assert.equal(toHeroRow(stats, ["win", "loss"]).recentWinrate, 0.5);
  assert.equal(toHeroRow(stats, ["win"]).recentWinrate, 1);
  assert.equal(toHeroRow(stats, []).winrate, 0);
  assert.equal(toHeroRow(stats, []).kda, 0);
});
