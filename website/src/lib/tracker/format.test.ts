import assert from "node:assert/strict";
import { test } from "node:test";

import { formatPlaytime } from "./compute";

test("rounds summed duration before splitting hours and minutes", () => {
  assert.equal(formatPlaytime(0), "0m");
  assert.equal(formatPlaytime(29), "0m");
  assert.equal(formatPlaytime(30), "1m");
  assert.equal(formatPlaytime(3569), "59m");
  assert.equal(formatPlaytime(3570), "1h");
  assert.equal(formatPlaytime(7199), "2h");
});

test("omits empty minutes while retaining meaningful session duration", () => {
  assert.equal(formatPlaytime(3600), "1h");
  assert.equal(formatPlaytime(3660), "1h 1m");
  assert.equal(formatPlaytime(11160), "3h 6m");
  assert.equal(formatPlaytime(86400), "24h");
});
