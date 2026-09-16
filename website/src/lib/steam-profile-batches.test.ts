import assert from "node:assert/strict";
import { test } from "node:test";

import { steamProfileBatches } from "./steam-profile-batches";

test("profile batches are identical for reordered or repeated account IDs", () => {
  const ids = [30, 2, 10, 2];
  assert.deepEqual(steamProfileBatches(ids), [[2, 10, 30]]);
  assert.deepEqual(steamProfileBatches([10, 30, 2]), steamProfileBatches(ids));
  assert.deepEqual(ids, [30, 2, 10, 2]);
});

test("canonical batches keep the API limit and include each account exactly once", () => {
  const ids = Array.from({ length: 1001 }, (_, index) => 1001 - index);
  const batches = steamProfileBatches([...ids, 1, 500, 1001]);
  assert.deepEqual(
    batches.map((batch) => batch.length),
    [500, 500, 1],
  );
  assert.deepEqual(batches.flat(), [...ids].reverse());
  assert.deepEqual(steamProfileBatches([...ids].reverse()), batches);
});

test("empty and invalid account IDs do not create profile requests", () => {
  assert.deepEqual(steamProfileBatches([]), []);
  assert.deepEqual(steamProfileBatches([0, -1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1]), []);
  assert.deepEqual(steamProfileBatches([42, 0, 42, 43]), [[42, 43]]);
});
