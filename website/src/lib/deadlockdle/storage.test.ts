import assert from "node:assert/strict";
import { test } from "node:test";

import { liveStreak } from "./storage";

const streak = (currentStreak: number, lastPlayedDate: string) => ({ currentStreak, lastPlayedDate });

test("a streak finished today or yesterday is still held", () => {
  assert.equal(liveStreak(streak(4, "2026-09-24"), "2026-09-24"), 4);
  assert.equal(liveStreak(streak(4, "2026-09-23"), "2026-09-24"), 4);
  assert.equal(liveStreak(streak(2, "2026-02-28"), "2026-03-01"), 2);
});

test("a missed day breaks the streak even before storage records it", () => {
  assert.equal(liveStreak(streak(4, "2026-09-22"), "2026-09-24"), 0);
});

test("missing, lost or malformed streaks read as none", () => {
  assert.equal(liveStreak(null, "2026-09-24"), 0);
  assert.equal(liveStreak(streak(0, "2026-09-24"), "2026-09-24"), 0);
  assert.equal(liveStreak({ currentStreak: 3 }, "2026-09-24"), 0);
});
