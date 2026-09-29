import assert from "node:assert/strict";
import { test } from "node:test";

import { day } from "~/dayjs";

import { MAP_REWORK_START, mapEraOf, trimToCurrentLayout } from "./map-era";

const REWORK = MAP_REWORK_START.unix();
const DAY = 86_400;

test("mapEraOf picks the layout the range was played on", () => {
  assert.deepEqual(mapEraOf(REWORK - 30 * DAY, REWORK - DAY), { era: "legacy", spansRework: false });
  assert.deepEqual(mapEraOf(REWORK - 30 * DAY, REWORK), { era: "legacy", spansRework: false });
  assert.deepEqual(mapEraOf(REWORK, undefined), { era: "city-never-sleeps", spansRework: false });
  assert.deepEqual(mapEraOf(REWORK + DAY, REWORK + 2 * DAY), { era: "city-never-sleeps", spansRework: false });
  // Across the rework: the newer layout, flagged.
  assert.deepEqual(mapEraOf(REWORK - 30 * DAY, undefined), { era: "city-never-sleeps", spansRework: true });
  assert.deepEqual(mapEraOf(undefined, undefined), { era: "city-never-sleeps", spansRework: true });
});

test("trimToCurrentLayout starts a range that crosses the rework at it", () => {
  const seasonStart = day.utc("2026-09-01T00:00:00Z");
  const [start, end] = trimToCurrentLayout([seasonStart, undefined]);
  assert.equal(start?.unix(), REWORK);
  assert.equal(end, undefined);

  const old: [typeof seasonStart, typeof seasonStart] = [seasonStart, day.utc("2026-09-20T00:00:00Z")];
  assert.equal(trimToCurrentLayout(old), old);
  const later: [typeof seasonStart, undefined] = [day.utc("2026-10-01T00:00:00Z"), undefined];
  assert.equal(trimToCurrentLayout(later), later);
});
