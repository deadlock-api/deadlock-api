import assert from "node:assert/strict";
import { test } from "node:test";

import { parseAsInteger } from "nuqs";

import { parseAsDayjs, parseAsDayjsRange, parseAsSetOf } from "./nuqs-parsers";

test("date URL values reject invalid Dayjs objects rather than propagating Invalid Date", () => {
  for (const value of ["", "not-a-date", "Infinity", "2026-09-11Tinvalid"]) {
    assert.equal(parseAsDayjs.parse(value), null, value);
  }
  const parsed = parseAsDayjs.parse("2026-09-11T19:00:00+02:00");
  assert.ok(parsed);
  assert.equal(parseAsDayjs.serialize(parsed), "2026-09-11T17:00:00.000Z");
});

test("date ranges preserve all-time and one-sided filters", () => {
  assert.deepEqual(parseAsDayjsRange.parse("_"), [undefined, undefined]);
  // Whole UTC days are written back as bare dates.
  for (const [value, written] of [
    ["2024-12-01T00:00:00.000Z_", "2024-12-01_"],
    ["_2024-12-01T23:59:59.999Z", "_2024-12-01"],
  ]) {
    const parsed = parseAsDayjsRange.parse(value);
    assert.ok(parsed);
    assert.equal(parseAsDayjsRange.serialize(parsed), written);
  }
});

test("date ranges accept bare dates as whole UTC days, and keep them short", () => {
  const parsed = parseAsDayjsRange.parse("2026-07-30_2026-09-28");
  assert.ok(parsed);
  assert.equal(parsed[0]?.toISOString(), "2026-07-30T00:00:00.000Z");
  assert.equal(parsed[1]?.toISOString(), "2026-09-28T23:59:59.999Z");
  assert.equal(parseAsDayjsRange.serialize(parsed), "2026-07-30_2026-09-28");
  // One day, start to end.
  assert.ok(parseAsDayjsRange.parse("2026-09-28_2026-09-28"));
  // A bare date that is no calendar day.
  assert.equal(parseAsDayjsRange.parse("2026-02-30_"), null);
  // A start between day boundaries keeps its exact instant.
  const patch = parseAsDayjsRange.parse("2026-09-11T19:00:00.000Z_2026-09-28");
  assert.ok(patch);
  assert.equal(parseAsDayjsRange.serialize(patch), "2026-09-11T19:00:00.000Z_2026-09-28");
});

test("date ranges reject malformed bounds and reversed time ranges", () => {
  for (const value of [
    "",
    "2024-12-01",
    "_extra_separator",
    "invalid_invalid",
    "invalid_2024-12-01",
    "2024-12-01_invalid",
    "2024-12-02_2024-12-01",
  ]) {
    assert.equal(parseAsDayjsRange.parse(value), null, value);
  }
});

test("valid ranges retain exact boundaries and compare instants across offsets", () => {
  const range = "2024-12-01T14:15:16.000Z_2024-12-01T23:59:59.999Z";
  const parsed = parseAsDayjsRange.parse(range);
  assert.ok(parsed);
  // The start between day boundaries stays exact; the end, a whole UTC day, is written short.
  assert.equal(parseAsDayjsRange.serialize(parsed), "2024-12-01T14:15:16.000Z_2024-12-01");
  const sameInstant = parseAsDayjsRange.parse("2026-09-11T19:00:00+02:00_2026-09-11T17:00:00Z");
  assert.ok(sameInstant);
  assert.equal(sameInstant[0]?.valueOf(), sameInstant[1]?.valueOf());
});

test("sets compare by their members, so an emptied set equals its empty default", () => {
  const parser = parseAsSetOf(parseAsInteger);
  assert.equal(parser.eq(new Set(), new Set()), true);
  assert.equal(parser.eq(new Set([1, 2]), new Set([2, 1])), true);
  assert.equal(parser.eq(new Set([1]), new Set([2])), false);
});
