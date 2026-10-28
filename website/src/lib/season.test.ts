import assert from "node:assert/strict";
import { test } from "node:test";

import { isHalloween } from "./season";

// Local dates: the season follows the visitor's own calendar day.
test("Halloween runs from October 30th through November 1st", () => {
  assert.equal(isHalloween(new Date(2026, 9, 29, 23, 59, 59)), false);
  assert.equal(isHalloween(new Date(2026, 9, 30, 0, 0, 0)), true);
  assert.equal(isHalloween(new Date(2026, 9, 31, 12, 0, 0)), true);
  assert.equal(isHalloween(new Date(2026, 10, 1, 23, 59, 59)), true);
  assert.equal(isHalloween(new Date(2026, 10, 2, 0, 0, 0)), false);
});

test("no Halloween the rest of the year", () => {
  assert.equal(isHalloween(new Date(2026, 5, 15)), false);
  assert.equal(isHalloween(new Date(2026, 11, 24)), false);
});
