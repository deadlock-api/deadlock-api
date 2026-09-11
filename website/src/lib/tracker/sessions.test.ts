import assert from "node:assert/strict";
import { test } from "node:test";

import type { PlayerMatchHistoryEntry } from "deadlock_api_client";

import { computeSessionMomentum, computeSessions } from "./compute";

function match(id: number, win: boolean, startHour = id, heroId = 1): PlayerMatchHistoryEntry {
  return {
    match_id: id,
    start_time: startHour * 3600,
    match_duration_s: 1200,
    hero_id: heroId,
    player_team: 0,
    match_result: win ? 0 : 1,
  } as PlayerMatchHistoryEntry;
}

test("hidden losses and other heroes retain the selected match's real session context", () => {
  const context = [match(1, false, 1, 2), match(2, false, 2, 2), match(3, true), match(4, true, 4, 2)];
  const result = computeSessionMomentum([context[2]], context);
  assert.deepEqual(
    result.byPosition.map((row) => row.matches),
    [0, 0, 1, 0],
  );
  assert.deepEqual(
    result.byPreviousResult.map((row) => [row.matches, row.wins]),
    [
      [0, 0],
      [1, 1],
      [1, 1],
    ],
  );
  assert.equal(result.sessions, 1);
  assert.equal(result.avgMatchesPerSession, 1);
  assert.equal(result.avgSessionTimeS, 1200);
});

test("hidden matches can bridge a session without inflating selected playtime or games", () => {
  const context = [match(3, true, 6), match(2, false, 3, 2), match(1, true, 0)];
  const result = computeSessionMomentum([context[0], context[2]], context);
  assert.equal(result.sessions, 1);
  assert.equal(result.avgMatchesPerSession, 2);
  assert.equal(result.avgSessionTimeS, 2400);
  assert.deepEqual(
    result.byPosition.map((row) => row.matches),
    [1, 0, 1, 0],
  );
  assert.deepEqual(
    result.byPreviousResult.map((row) => row.matches),
    [0, 1, 0],
  );
});

test("session boundaries reset preceding outcomes and entirely hidden sessions do not count", () => {
  const context = [match(10, true, 10), match(2, false, 2), match(1, false, 1)];
  const result = computeSessionMomentum([context[0]], context);
  assert.equal(result.sessions, 1);
  assert.deepEqual(
    result.byPosition.map((row) => row.matches),
    [1, 0, 0, 0],
  );
  assert.deepEqual(
    result.byPreviousResult.map((row) => row.matches),
    [0, 0, 0],
  );
});

test("empty selections have no sessions even when context has matches", () => {
  const result = computeSessionMomentum([], [match(1, true)]);
  assert.equal(result.sessions, 0);
  assert.equal(result.avgMatchesPerSession, 0);
  assert.equal(result.avgSessionTimeS, 0);
  assert.ok(result.byPosition.every((row) => row.matches === 0));
});

test("default context retains full history behavior without depending on response order", () => {
  const entries = [match(1, false), match(2, false), match(3, true), match(4, true)];
  const original = [...entries];
  const result = computeSessionMomentum(entries);
  assert.deepEqual(result, computeSessionMomentum([...entries].reverse()));
  assert.deepEqual(
    result.byPosition.map((row) => row.matches),
    [1, 1, 1, 1],
  );
  assert.deepEqual(
    result.byPreviousResult.map((row) => row.matches),
    [1, 2, 1],
  );
  assert.equal(result.avgMatchesPerSession, 4);
  assert.deepEqual(entries, original);
});

test("match-list session headers and overview agree while only counting selected matches", () => {
  const first = { ...match(1, true, 0), ranked_delta: 100 };
  const hidden = { ...match(2, false, 3, 2), ranked_delta: -100 };
  const last = { ...match(3, true, 6), ranked_delta: 150 };
  const selected = [last, first];
  const context = [last, hidden, first];
  const sessions = computeSessions(selected, context);
  const summary = sessions.get(first.match_id);
  assert.ok(summary);
  assert.equal(sessions.get(last.match_id), summary);
  assert.equal(sessions.has(hidden.match_id), false);
  assert.equal(summary.matches, 2);
  assert.equal(summary.wins, 2);
  assert.equal(summary.losses, 0);
  assert.equal(summary.rankDelta, 250);
  assert.equal(summary.totalTimeS, 2400);
  assert.equal(new Set(sessions.values()).size, computeSessionMomentum(selected, context).sessions);
});
