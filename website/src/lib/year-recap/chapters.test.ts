import assert from "node:assert/strict";
import { test } from "node:test";

import { recapChapters } from "./chapters";
import type { YearRecap } from "./types";

const sample = (): YearRecap => {
  const totals = {
    matches: 3,
    wins: 2,
    detailed_matches: 0,
    damage_matrix_matches: 0,
    seconds_played: 5400,
    kills: 10,
    deaths: 5,
    assists: 12,
    souls: 90000,
    mvp_rated_matches: 0,
    player_healing: 0,
    teammate_healing: 0,
    time_dead_s: 0,
    dm_bullet: 0,
    dm_ability: 0,
    dm_melee: 0,
  };
  return {
    account_id: 1,
    year: 2026,
    start_unix: 1_767_225_600,
    end_unix: 1_798_761_600,
    matches: [
      {
        match_id: 1,
        start_time: 1_767_300_000,
        duration_s: 1800,
        game_mode: "normal",
        match_mode: "unranked",
        hero_id: 1,
        won: true,
      },
    ],
    modes: [
      {
        game_mode: "normal",
        totals,
        by_match_mode: [],
        heroes: [],
        teams: [],
        lanes: [],
        records: [],
        streaks: { longest_win: { length: 0, from: 0, to: 0 }, longest_loss: { length: 0, from: 0, to: 0 } },
        items: [],
        damage_sources: [],
        damage_targets: [],
        killers: [],
        enemies: [],
        accolades: [],
        rank: null,
      },
    ],
  } as unknown as YearRecap;
};

test("without details only the chapters every match feeds appear", () => {
  assert.deepEqual(
    recapChapters(sample()).map((chapter) => chapter.id),
    ["intro", "games", "time", "combat", "souls", "outro", "share"],
  );
});

test("no matches, no chapters", () => {
  assert.deepEqual(recapChapters({ ...sample(), matches: [] }), []);
});

test("a few detailed matches are not enough for a detail chapter", () => {
  const recap = sample();
  const [mode] = recap.modes;
  if (!mode) throw new Error("no mode");
  mode.teams = [{ team: 0, matches: 4, wins: 4 }];
  mode.totals.detailed_matches = 4;
  assert.ok(!recapChapters(recap).some((chapter) => chapter.id === "sides"));
  mode.totals.detailed_matches = 10;
  assert.ok(recapChapters(recap).some((chapter) => chapter.id === "sides"));
});

test("friends only when they answered", () => {
  assert.ok(recapChapters(sample(), { hasFriends: true }).some((chapter) => chapter.id === "friends"));
});
