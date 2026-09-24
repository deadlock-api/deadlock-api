import assert from "node:assert/strict";
import { test } from "node:test";

import { fineShareDigits, formatFineShare } from "./format";

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
