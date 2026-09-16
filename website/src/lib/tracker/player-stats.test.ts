import assert from "node:assert/strict";
import { test } from "node:test";

import type { TrackerMatchPlayer } from "~/queries/tracker-queries";

import { PLAYER_STAT_COLUMNS, sortScoreboardPlayers } from "./player-stats";

function player(accountId: number, value: number, overrides: Partial<TrackerMatchPlayer> = {}): TrackerMatchPlayer {
  return {
    account_id: accountId,
    net_worth: value,
    player_damage: value,
    last_hits: value,
    denies: value,
    player_damage_taken: value,
    boss_damage: value,
    player_healing: value,
    kills: value,
    deaths: 1,
    assists: 0,
    ...overrides,
  } as TrackerMatchPlayer;
}

test("scoreboard columns sort by their underlying stat, in either direction", () => {
  const players = [player(1, 25000), player(2, 900), player(3, 2400)];
  for (const column of PLAYER_STAT_COLUMNS) {
    assert.deepEqual(
      sortScoreboardPlayers(players, column.key, "desc").map((p) => p.account_id),
      [1, 3, 2],
    );
    assert.deepEqual(
      sortScoreboardPlayers(players, column.key, "asc").map((p) => p.account_id),
      [2, 3, 1],
    );
  }
});

test("scoreboard KDA sorts the ratio including assists, with deathless players remaining finite", () => {
  const players = [
    player(1, 10, { deaths: 10 }),
    player(2, 4, { assists: 2 }),
    player(3, 3, { assists: 8, deaths: 0 }),
  ];
  assert.deepEqual(
    sortScoreboardPlayers(players, "kda", "desc").map((p) => p.account_id),
    [3, 2, 1],
  );
  assert.deepEqual(
    sortScoreboardPlayers(players, "kda", "asc").map((p) => p.account_id),
    [1, 2, 3],
  );
});

test("scoreboard ties are deterministic and default ordering leaves cached team data untouched", () => {
  const players = [player(3, 10), player(1, 10), player(2, 10)];
  const original = structuredClone(players);
  for (const direction of ["asc", "desc"] as const) {
    assert.deepEqual(
      sortScoreboardPlayers(players, "damage", direction).map((p) => p.account_id),
      [1, 2, 3],
    );
  }
  assert.deepEqual(sortScoreboardPlayers(players, null, "desc"), players);
  assert.deepEqual(sortScoreboardPlayers(players, "unknown", "desc"), players);
  assert.deepEqual(players, original);
});
