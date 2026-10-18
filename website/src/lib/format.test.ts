import assert from "node:assert/strict";
import { test } from "node:test";

import {
  fineShareDigits,
  formatCountNoun,
  formatFineShare,
  formatRange,
  formatSignedPoints,
  formatUtcDateTime,
} from "./format";

test("formatUtcDateTime prints the moment in UTC with the zone", () => {
  assert.equal(formatUtcDateTime(new Date(Date.UTC(2026, 9, 18, 22, 15, 42))), "2026-10-18 22:15 UTC");
});

test("formatFineShare keeps two significant digits below 1%", () => {
  assert.equal(formatFineShare(0.000886), "0.089%");
  assert.equal(formatFineShare(0.005), "0.50%");
  assert.equal(formatFineShare(0.000012), "0.0012%");
  assert.equal(formatFineShare(0.0000029), "0.00029%");
});

test("formatFineShare prints one decimal from 1% up", () => {
  assert.equal(formatFineShare(0.162), "16.2%");
  assert.equal(formatFineShare(1), "100.0%");
  assert.equal(formatFineShare(0), "0.0%");
});

test("formatFineShare never prints a nonzero share as zero", () => {
  assert.equal(formatFineShare(0.000000001), "<0.000001%");
  assert.equal(fineShareDigits(0.000000001), 6);
});

test("formatSignedPoints prints a rate difference in percentage points that never breaks", () => {
  assert.equal(formatSignedPoints(0.168), "+16.8\u00a0pp");
  assert.equal(formatSignedPoints(-0.011), "\u22121.1\u00a0pp");
  assert.equal(formatSignedPoints(0), "0.0\u00a0pp");
});

test("formatCountNoun puts the noun in the count's number", () => {
  assert.equal(formatCountNoun(1, "pt"), "1 pt");
  assert.equal(formatCountNoun(0, "pt"), "0 pts");
  assert.equal(formatCountNoun(5, "ability point"), "5 ability points");
  assert.equal(formatCountNoun(1200, "game"), "1,200 games");
});

test("formatRange: an en dash, spaced when an end has a sign or a space", () => {
  assert.equal(formatRange("12", "34"), "12–34");
  assert.equal(formatRange("1.2k", "3.4k"), "1.2k–3.4k");
  assert.equal(formatRange("-3", "5"), "-3 – 5");
  assert.equal(formatRange("1 min", "2 min"), "1 min – 2 min");
});
