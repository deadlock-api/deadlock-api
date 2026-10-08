import assert from "node:assert/strict";
import { test } from "node:test";

import { hasRawNoValue } from "./lint-design-system-patterns.mjs";

test("raw-no-value flags a dash standing in for a missing value", () => {
  for (const line of [
    '<span className="text-muted-foreground">—</span>',
    '{value ? format(value) : "—"}',
    '{value ?? "-"}',
    '{value || "-"}',
    '{a && "–"}',
    'if (streak === 0) return "–";',
    'const show = (v) => "-";',
    '{values ? fmt(values.avg) : "-"}',
    'value={avgDeaths > 0 ? ratio.toFixed(2) : "-"}',
  ]) {
    assert.ok(hasRawNoValue(line), line);
  }
});

test("raw-no-value leaves signs, separators and literals alone", () => {
  for (const line of [
    'const sign = d < 0 ? "-" : "+";',
    'const sign = d >= 0 ? "+" : "-";',
    '`${neg ? "-" : ""}${value}`',
    'const options = { sep: "-" };',
    'type Sign = (x: "-" | "+") => void;',
    "<b>{a}</b> - <b>{b}</b>",
    'parts.join("-")',
    'nullLabel="—"',
    "a — b",
  ]) {
    assert.ok(!hasRawNoValue(line), line);
  }
});
