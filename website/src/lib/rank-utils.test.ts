import assert from "node:assert/strict";
import { test } from "node:test";

import type { Rank } from "deadlock_api_client";

import { badgeLabel, rankRangeLabel } from "./rank-utils";

const ranks = [
  { tier: 0, name: "Obscurus" },
  { tier: 7, name: "Ritualist" },
  { tier: 9, name: "Phantom" },
  { tier: 11, name: "Eternus" },
] as Rank[];

test("a badge is named from the ranks asset", () => {
  assert.equal(badgeLabel(ranks, 91), "Phantom 1");
  assert.equal(badgeLabel(ranks, 0), "Obscurus");
  assert.equal(badgeLabel(undefined, 91), "Tier 9.1");
});

test("a range reads as prose", () => {
  assert.equal(rankRangeLabel(ranks, 91, 116), "Phantom 1+");
  assert.equal(rankRangeLabel(ranks, 0, 116), "all ranks");
  assert.equal(rankRangeLabel(ranks, 0, 76), "up to Ritualist 6");
  assert.equal(rankRangeLabel(ranks, 71, 96), "Ritualist 1 to Phantom 6");
});
