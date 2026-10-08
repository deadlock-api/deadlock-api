import assert from "node:assert/strict";
import { test } from "node:test";

import { hasRawColorVar, hasRawNoValue } from "./lint-design-system-patterns.mjs";

test("raw-color-var flags a CSS variable handed over as a color, however it is built", () => {
  for (const line of [
    'color="var(--primary)"',
    "accent={`var(--${tone})`}",
    "fill={`var(--chart-${index + 1})`}",
    'stroke={"var(--chart-" + index + ")"}',
  ]) {
    assert.ok(hasRawColorVar(line), line);
  }
});

test("raw-color-var leaves types, class values and data-driven variables alone", () => {
  for (const line of [
    "export const TONE_COLOR: Record<Tone, `var(--${string})`> = {",
    'className="max-w-[var(--radix-select-content-available-width)]"',
    "opacity={`var(--hero-opacity-${heroId}, 1)`}",
    '"drop-shadow(0 0 4px color-mix(in srgb, var(--primary) 80%, transparent))"',
  ]) {
    assert.ok(!hasRawColorVar(line), line);
  }
});

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
