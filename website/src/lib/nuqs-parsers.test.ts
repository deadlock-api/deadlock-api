import assert from "node:assert/strict";
import { test } from "node:test";

import { parseAsDayjs, parseAsDayjsRange } from "./nuqs-parsers";

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
  for (const value of ["2024-12-01T00:00:00.000Z_", "_2024-12-01T23:59:59.999Z"]) {
    const parsed = parseAsDayjsRange.parse(value);
    assert.ok(parsed);
    assert.equal(parseAsDayjsRange.serialize(parsed), value);
  }
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
  assert.equal(parseAsDayjsRange.serialize(parsed), range);
  const sameInstant = parseAsDayjsRange.parse("2026-09-11T19:00:00+02:00_2026-09-11T17:00:00Z");
  assert.ok(sameInstant);
  assert.equal(sameInstant[0]?.valueOf(), sameInstant[1]?.valueOf());
});
