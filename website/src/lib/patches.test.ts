import assert from "node:assert/strict";
import { test } from "node:test";

import { day } from "~/dayjs";

import type { PatchInfo } from "./constants";
import { getPatch, isIndexedPatch, isSettled, nextPatch, patchWindows, previousPatch, windowDays } from "./patches";

const DAY = 86_400;

const patch = (id: string, start: string, end?: string): PatchInfo => ({
  id,
  name: id,
  shortName: id,
  startDate: day.utc(start),
  endDate: end ? day.utc(end) : undefined,
});

const PATCHES = [
  patch("c", "2026-09-29T20:00:00Z"),
  patch("b", "2026-07-30T19:00:00Z", "2026-09-29T20:00:00Z"),
  patch("a", "2026-07-28T19:00:00Z", "2026-07-30T19:00:00Z"),
  patch("old", "2026-01-01T00:00:00Z", "2026-07-28T19:00:00Z"),
];

test("patch lookup and neighbours", () => {
  assert.equal(getPatch(PATCHES, "b"), PATCHES[1]);
  assert.equal(getPatch(PATCHES, "nope"), undefined);
  assert.equal(previousPatch(PATCHES, "c"), PATCHES[1]);
  assert.equal(nextPatch(PATCHES, "b"), PATCHES[0]);
  assert.equal(nextPatch(PATCHES, "c"), undefined);
  assert.equal(previousPatch(PATCHES, "old"), undefined);
});

test("windows: 14 days each side, cut at the next patch, never tied to now", () => {
  const start = PATCHES[0].startDate.unix();
  const current = patchWindows(PATCHES[0]);
  assert.deepEqual(current.before, { minUnixTimestamp: start - 14 * DAY, maxUnixTimestamp: start });
  assert.deepEqual(current.after, { minUnixTimestamp: start, maxUnixTimestamp: start + 14 * DAY });
  // "a" was followed by another patch two days later.
  assert.equal(patchWindows(PATCHES[2]).after.maxUnixTimestamp, PATCHES[1].startDate.unix());
});

test("settled and window length", () => {
  const windows = patchWindows(PATCHES[0]);
  const start = windows.after.minUnixTimestamp;
  assert.equal(isSettled(windows, start + 3 * DAY), false);
  assert.equal(isSettled(windows, start + 14 * DAY), true);
  assert.equal(windowDays(windows.after, start + 3 * DAY), 3);
  assert.equal(windowDays(windows.after, start + 30 * DAY), 14);
  assert.equal(windowDays(windows.after, start - DAY), 0);
});

test("only the newest patches are indexed", () => {
  assert.equal(isIndexedPatch(PATCHES, "c"), true);
  assert.equal(isIndexedPatch(PATCHES, "a"), true);
  assert.equal(isIndexedPatch(PATCHES, "old"), false);
});
