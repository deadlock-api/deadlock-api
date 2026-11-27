import assert from "node:assert/strict";
import { test } from "node:test";

import { isRecapOpen, recapWindowLabel, recapYear } from "./availability";

const at = (iso: string) => new Date(iso);

test("the recap opens on 1 December and closes after 15 January, UTC", () => {
  assert.equal(isRecapOpen(at("2026-11-30T23:59:59Z")), false);
  assert.equal(isRecapOpen(at("2026-12-01T00:00:00Z")), true);
  assert.equal(isRecapOpen(at("2026-12-31T23:59:59Z")), true);
  assert.equal(isRecapOpen(at("2027-01-01T00:00:00Z")), true);
  assert.equal(isRecapOpen(at("2027-01-15T23:59:59Z")), true);
  assert.equal(isRecapOpen(at("2027-01-16T00:00:00Z")), false);
  assert.equal(isRecapOpen(at("2027-06-10T12:00:00Z")), false);
});

test("December and early January recap the year that just ended, other months the year in progress", () => {
  assert.equal(recapYear(at("2026-12-01T00:00:00Z")), 2026);
  assert.equal(recapYear(at("2027-01-01T00:00:00Z")), 2026);
  assert.equal(recapYear(at("2027-01-15T23:59:59Z")), 2026);
  assert.equal(recapYear(at("2027-01-16T00:00:00Z")), 2027);
  assert.equal(recapYear(at("2026-11-27T10:00:00Z")), 2026);
});

test("no recap year before the first one the API has", () => {
  assert.equal(recapYear(at("2026-01-05T00:00:00Z")), 2026);
});

test("the window reads the same everywhere", () => {
  assert.deepEqual(recapWindowLabel(2026), { opens: "1 December 2026", closes: "15 January 2027" });
});
