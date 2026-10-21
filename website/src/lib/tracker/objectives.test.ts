import assert from "node:assert/strict";
import { test } from "node:test";

import { describeObjectiveOutcome, type ObjectiveEvent } from "./objectives";
import { NEUTRAL_SIDES, PLAYER_SIDES } from "./teams";

const event = (kind: ObjectiveEvent["kind"], own: boolean): ObjectiveEvent => ({ time: 600, kind, own, team: "Team0" });

// A match seen on its own (no tracked player) takes the Hidden King's side, so "your team" there named The Hidden King.
test("objective outcomes name the teams in a match seen on its own", () => {
  assert.equal(describeObjectiveOutcome(event("guardian", true), NEUTRAL_SIDES), "Destroyed by The Hidden King");
  assert.equal(describeObjectiveOutcome(event("walker", false), NEUTRAL_SIDES), "Destroyed by The Archmother");
  assert.equal(describeObjectiveOutcome(event("midBoss", false), NEUTRAL_SIDES), "Claimed by The Archmother");
});

test("objective outcomes speak from the tracked player's side", () => {
  assert.equal(describeObjectiveOutcome(event("guardian", true), PLAYER_SIDES), "Destroyed by your team");
  assert.equal(describeObjectiveOutcome(event("walker", false), PLAYER_SIDES), "Lost to the enemy");
  assert.equal(describeObjectiveOutcome(event("midBoss", false), PLAYER_SIDES), "Claimed by the enemy");
});
