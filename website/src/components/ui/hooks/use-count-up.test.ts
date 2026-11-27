import assert from "node:assert/strict";
import { test } from "node:test";

import { formatCountable, parseCountable } from "./use-count-up";

test("parses numbers the recap prints", () => {
  assert.deepEqual(parseCountable("2,842"), { prefix: "", value: 2842, suffix: "", decimals: 0, grouped: true });
  assert.deepEqual(parseCountable("51.1%"), { prefix: "", value: 51.1, suffix: "%", decimals: 1, grouped: false });
  assert.deepEqual(parseCountable("163.1K"), { prefix: "", value: 163.1, suffix: "K", decimals: 1, grouped: false });
  assert.deepEqual(parseCountable("+12"), { prefix: "+", value: 12, suffix: "", decimals: 0, grouped: false });
});

test("leaves text that is not one number alone", () => {
  assert.equal(parseCountable("30:51"), null);
  assert.equal(parseCountable("Ascendant 4"), null);
  assert.equal(parseCountable("Oct 14"), null);
  assert.equal(parseCountable(""), null);
});

test("formats intermediate values like the original", () => {
  const n = parseCountable("12,122")!;
  assert.equal(formatCountable(n, 1234.4), "1,234");
  assert.equal(formatCountable(n, 12122), "12,122");
  const p = parseCountable("51.1%")!;
  assert.equal(formatCountable(p, 7.26), "7.3%");
});
