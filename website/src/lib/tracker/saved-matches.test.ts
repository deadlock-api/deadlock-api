import assert from "node:assert/strict";
import { test } from "node:test";

import { parseSavedMatches, restoreSavedMatch, savedMatchesKey } from "./saved-matches";

test("saved matches retain valid IDs in saved order without duplicates", () => {
  assert.deepEqual(parseSavedMatches("[103841923,554500,103841923,95227707]"), [103841923, 554500, 95227707]);
  assert.deepEqual(parseSavedMatches('[null,false,"123",0,-1,1.5,9007199254740992,42]'), [42]);
});

test("damaged or unexpected saved-match storage starts with an empty list", () => {
  for (const raw of [null, "", "{", "null", "42", "true", '"123"', '{"matches":[123]}']) {
    assert.deepEqual(parseSavedMatches(raw), []);
  }
});

test("saved matches are stored separately for each tracked account", () => {
  const stored = new Map([
    [savedMatchesKey(74963221), "[103841923]"],
    [savedMatchesKey(18373975), "[29561860]"],
  ]);
  assert.deepEqual(parseSavedMatches(stored.get(savedMatchesKey(74963221)) ?? null), [103841923]);
  assert.deepEqual(parseSavedMatches(stored.get(savedMatchesKey(18373975)) ?? null), [29561860]);
  assert.deepEqual(parseSavedMatches(stored.get(savedMatchesKey(33406)) ?? null), []);
});

test("undo restores the original saved position while preserving newer bookmarks", () => {
  assert.deepEqual(restoreSavedMatch([4, 3, 1], [3, 2, 1], 2), [4, 3, 2, 1]);
  assert.deepEqual(restoreSavedMatch([4, 2, 1], [3, 2, 1], 3), [4, 3, 2, 1]);
  assert.deepEqual(restoreSavedMatch([4, 3, 2], [3, 2, 1], 1), [4, 3, 2, 1]);
});

test("undo respects intervening removals and does not duplicate an already restored match", () => {
  assert.deepEqual(restoreSavedMatch([5, 1], [4, 3, 2, 1], 3), [5, 3, 1]);
  assert.deepEqual(restoreSavedMatch([], [3, 2, 1], 2), [2]);
  assert.deepEqual(restoreSavedMatch([4, 2, 3, 1], [3, 2, 1], 2), [4, 2, 3, 1]);
  assert.deepEqual(restoreSavedMatch([3, 2, 1], [3, 2, 1], 9), [3, 2, 1]);
});
