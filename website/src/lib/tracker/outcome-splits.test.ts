import assert from "node:assert/strict";
import { test } from "node:test";

import type { PlayerMatchHistoryEntry } from "deadlock_api_client";

import { computeOutcomeSplits } from "./compute";

const match = (seconds: number, won = true, team = 0) =>
  ({
    match_duration_s: seconds,
    player_team: team,
    match_result: won ? team : 1 - team,
  }) as PlayerMatchHistoryEntry;

test("Street Brawl duration bands separate short matches at exact minute boundaries", () => {
  const entries = [
    match(599),
    match(600, false),
    match(899),
    match(900),
    match(1199, false),
    match(1200, false, 1),
    match(1450, true, 1),
  ];
  const before = structuredClone(entries);
  const result = computeOutcomeSplits(entries, "street_brawl");
  assert.deepEqual(result.byDuration, [
    { label: "Under 10 min", matches: 1, wins: 1 },
    { label: "10–15 min", matches: 2, wins: 1 },
    { label: "15–20 min", matches: 2, wins: 1 },
    { label: "20+ min", matches: 2, wins: 1 },
  ]);
  assert.deepEqual(
    result.bySide.map(({ matches, wins }) => [matches, wins]),
    [
      [5, 3],
      [2, 1],
    ],
  );
  assert.deepEqual(entries, before);
});

test("normal match duration bands keep 25, 35 and 45 minute boundaries", () => {
  const entries = [1499, 1500, 2099, 2100, 2699, 2700].map((seconds) => match(seconds));
  const expected = [
    { label: "Under 25 min", matches: 1, wins: 1 },
    { label: "25–35 min", matches: 2, wins: 2 },
    { label: "35–45 min", matches: 2, wins: 2 },
    { label: "45+ min", matches: 1, wins: 1 },
  ];
  assert.deepEqual(computeOutcomeSplits(entries).byDuration, expected);
  assert.deepEqual(computeOutcomeSplits(entries, "normal_ranked").byDuration, expected);
  assert.deepEqual(computeOutcomeSplits(entries, "normal_unranked").byDuration, expected);
});

test("empty selections retain the selected mode's neutral duration rows", () => {
  const result = computeOutcomeSplits([], "street_brawl");
  assert.deepEqual(
    result.byDuration.map((row) => row.label),
    ["Under 10 min", "10–15 min", "15–20 min", "20+ min"],
  );
  assert.ok([...result.byDuration, ...result.bySide].every((row) => row.matches === 0 && row.wins === 0));
});
