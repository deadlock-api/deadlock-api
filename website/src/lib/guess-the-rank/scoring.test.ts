import assert from "node:assert/strict";
import { test } from "node:test";

import {
  distanceEmoji,
  guessableTiers,
  guessShareText,
  MAX_DAY_POINTS,
  roundPoints,
  scoreGrade,
  subtierOfBadge,
  tierOfBadge,
} from "./scoring";

test("a badge splits into tier and subtier", () => {
  assert.equal(tierOfBadge(74), 7);
  assert.equal(subtierOfBadge(74), 4);
  assert.equal(tierOfBadge(116), 11);
  assert.equal(subtierOfBadge(116), 6);
});

test("points fall off with each tier a guess is off", () => {
  assert.equal(roundPoints(7, 7), 5);
  assert.equal(roundPoints(6, 7), 4);
  assert.equal(roundPoints(9, 7), 3);
  assert.equal(roundPoints(4, 7), 2);
  assert.equal(roundPoints(11, 7), 1);
  assert.equal(roundPoints(2, 7), 0);
  assert.equal(roundPoints(1, 11), 0);
  assert.equal(MAX_DAY_POINTS, 15);
});

test("the guessable tiers are the ranked tiers of the ranks asset, in order", () => {
  assert.deepEqual(guessableTiers([{ tier: 2 }, { tier: 0 }, { tier: 1 }, { tier: 3 }]), [1, 2, 3]);
});

test("the share text names the day, the score and a square per round", () => {
  const text = guessShareText("2026-10-12", [
    { guess: 7, actual: 7 },
    { guess: 5, actual: 6 },
    { guess: 1, actual: 9 },
  ]);
  const [title, grid, link] = text.split("\n");
  assert.equal(title, "Guess the Rank #3 9/15");
  assert.equal(grid, `${distanceEmoji(0)}${distanceEmoji(1)}${distanceEmoji(8)}`);
  assert.match(link, /^https:\/\/deadlock-api\.com\/games\/guess-the-rank(\?date=2026-10-12)?$/);
});

test("a round scores until four tiers off, the share square tells scoring misses from scoreless ones", () => {
  assert.equal(distanceEmoji(4), "\u{1f7e5}");
  assert.equal(distanceEmoji(5), "\u2b1b");
});

test("grades split the score in thirds", () => {
  assert.equal(scoreGrade(15, 15), "good");
  assert.equal(scoreGrade(10, 15), "good");
  assert.equal(scoreGrade(5, 15), "fair");
  assert.equal(scoreGrade(4, 15), "poor");
});
