#!/usr/bin/env node
// Law 18: every text-on-surface pair the tokens produce is measured against WCAG 2.2 contrast (SC 1.4.3 for text,
// SC 1.4.11 for icons and other non-text UI). Run `node scripts/check-contrast.mjs`.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TOKENS = path.join(ROOT, "src/styles/tokens.css");

const TEXT_MIN = 4.5;
const UI_MIN = 3;

// ---- Token parsing --------------------------------------------------------------------------------------------
// A theme is a rule at column 0; the `:root` nested inside `@media (prefers-reduced-motion)` is indented and holds
// no colors.
const THEME_BLOCK = /^(:root|\.[\w-]+|\[data-theme=[^\]]+\])\s*\{([^}]*)\}/gm;
const DECLARATION = /(--[\w-]+)\s*:\s*([^;]+);/g;
const VAR_REFERENCE = /^var\(\s*(--[\w-]+)\s*(?:,\s*([^]+))?\)$/;

function readThemes(css) {
  const blocks = new Map();
  for (const [, selector, body] of css.matchAll(THEME_BLOCK)) {
    const vars = blocks.get(selector) ?? new Map();
    for (const [, name, value] of body.matchAll(DECLARATION)) vars.set(name, value.trim());
    blocks.set(selector, vars);
  }
  const root = blocks.get(":root") ?? new Map();
  // A theme class only overrides what it redefines; the rest still comes from :root.
  return [...blocks].map(([selector, vars]) => [selector, selector === ":root" ? vars : new Map([...root, ...vars])]);
}

// ---- Color ----------------------------------------------------------------------------------------------------
const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const linearToSrgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

// OKLab -> LMS -> linear sRGB, with Björn Ottosson's matrices (https://bottosson.github.io/posts/oklab/).
function oklchToLinear(l, c, hue) {
  const h = (hue * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);
  const L = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const M = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const S = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
    -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
    -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S,
  ];
}

function parseColor(value) {
  const hex = /^#([0-9a-f]{3,8})$/i.exec(value);
  if (hex) {
    const d = hex[1].length <= 4 ? [...hex[1]].map((c) => c + c).join("") : hex[1];
    const parts = [0, 2, 4, 6].map((i) => Number.parseInt(d.slice(i, i + 2), 16));
    return { rgb: parts.slice(0, 3), alpha: d.length === 8 ? parts[3] / 255 : 1, clipped: false };
  }
  const rgb = /^rgba?\(([^)]+)\)$/i.exec(value);
  if (rgb) {
    const [r, g, b, a = "1"] = rgb[1].split(/[\s,/]+/).filter(Boolean);
    return { rgb: [r, g, b].map(Number), alpha: Number(a), clipped: false };
  }
  const oklch = /^oklch\(([^)]+)\)$/i.exec(value);
  if (oklch) {
    const [l, c, h, a = "1"] = oklch[1].split(/[\s,/]+/).filter(Boolean);
    const lightness = l.endsWith("%") ? Number.parseFloat(l) / 100 : Number(l);
    const linear = oklchToLinear(lightness, Number(c), Number.parseFloat(h));
    return {
      rgb: linear.map((v) => Math.round(linearToSrgb(Math.min(1, Math.max(0, v))) * 255)),
      alpha: a.endsWith("%") ? Number.parseFloat(a) / 100 : Number(a),
      clipped: linear.some((v) => v < -1e-6 || v > 1 + 1e-6),
    };
  }
  return null;
}

function tokenColor(vars, token) {
  let value = vars.get(`--${token}`);
  for (let ref = value && VAR_REFERENCE.exec(value); ref; ref = value && VAR_REFERENCE.exec(value)) {
    value = vars.get(ref[1]) ?? ref[2];
  }
  const color = value && parseColor(value);
  if (!color) throw new Error(`cannot resolve --${token} (${value ?? "undefined"})`);
  return color;
}

// Alpha compositing happens in gamma-encoded sRGB, the way the browser paints it.
const composite = (fg, bg, alpha = fg.alpha) => ({
  rgb: fg.rgb.map((c, i) => alpha * c + (1 - alpha) * bg.rgb[i]),
  alpha: 1,
  clipped: fg.clipped || bg.clipped,
});

const luminance = ({ rgb }) => {
  const [r, g, b] = rgb.map((c) => srgbToLinear(Math.min(1, Math.max(0, c / 255))));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const hex = ({ rgb }) =>
  `#${rgb
    .map((c) =>
      Math.round(Math.min(255, Math.max(0, c)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;

// ---- Pairs ----------------------------------------------------------------------------------------------------
// A surface is `token`, `token/NN` (a Tailwind alpha tint) or `token/NN over base`.
const SURFACE = /^([\w-]+)(?:\/(\d+))?(?:\s+over\s+([\w-]+))?$/;

function surfaceColor(vars, spec) {
  const [, token, percent, base] = SURFACE.exec(spec);
  const color = tokenColor(vars, token);
  if (!base) return color;
  return composite(color, tokenColor(vars, base), percent ? Number(percent) / 100 : color.alpha);
}

const TEXT_TOKENS = [
  "foreground",
  "muted-foreground",
  "primary",
  "positive",
  "negative",
  "warning",
  "info",
  "destructive",
];
const SURFACE_TOKENS = ["background", "card", "muted", "accent", "popover"];

const pairs = [];
for (const text of TEXT_TOKENS) {
  for (const surface of SURFACE_TOKENS) pairs.push({ text, surface, min: TEXT_MIN });
}

const variant = (text, surface, min = TEXT_MIN) => pairs.push({ text, surface, min });

for (const [token, fill] of [
  ["primary-foreground", "primary"],
  ["destructive-foreground", "destructive"],
  ["foreground", "input/30 over card"],
  ["secondary-foreground", "secondary"],
  ["accent-foreground", "accent/50 over card"],
  ["primary", "card"],
  ["primary", "primary/10 over card"],
  ["primary", "primary/15 over card"],
  ["muted-foreground", "subtle over card"],
  ["muted-foreground", "subtle-hover over card"],
  ["destructive", "destructive/10 over card"],
  ["destructive", "destructive/15 over card"],
  ["positive", "positive/10 over card"],
  ["positive", "positive/20 over card"],
  ["negative", "negative/10 over card"],
  ["negative", "negative/15 over card"],
  ["warning", "warning/10 over card"],
  ["warning", "warning/20 over card"],
  ["info", "info/10 over card"],
  ["info", "info/20 over card"],
  ["foreground", "steam-bg"],
]) {
  variant(token, fill);
}

for (const [token, fill] of [
  ["primary-foreground", "primary"],
  ["secondary-foreground", "secondary"],
  ["destructive-foreground", "destructive"],
  ["foreground", "card"],
  ["muted-foreground", "muted"],
  ["primary", "primary/10 over card"],
  ["positive", "positive/10 over card"],
  ["negative", "negative/10 over card"],
  ["warning", "warning/10 over card"],
  ["info", "info/10 over card"],
  ...Array.from({ length: 8 }, (_, i) => ["foreground", `chart-${i + 1}/10 over card`]),
]) {
  variant(token, fill);
}

// Icon tiles and the segmented control: a glyph and a selected state, judged as non-text UI.
for (const [token, fill] of [
  ["muted-foreground", "muted"],
  ["primary", "primary/10 over card"],
  ["positive", "positive/10 over card"],
  ["negative", "negative/10 over card"],
  ["warning", "warning/10 over card"],
  ["info", "info/10 over card"],
]) {
  variant(token, fill, UI_MIN);
}
variant("muted-foreground", "secondary");
variant("foreground", "primary/15 over secondary");
variant("foreground", "primary/10 over card");

const seen = new Set();
const unique = pairs.filter(({ text, surface, min }) => {
  const key = `${text}|${surface}|${min}`;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});

// ---- Report ---------------------------------------------------------------------------------------------------
const themes = readThemes(fs.readFileSync(TOKENS, "utf8"));
const rows = [];
for (const [selector, vars] of themes) {
  for (const { text, surface, min } of unique) {
    const fg = tokenColor(vars, text);
    const bg = surfaceColor(vars, surface);
    const over = fg.alpha < 1 ? composite(fg, bg) : fg;
    const ratio = contrast(over, bg);
    rows.push({
      theme: selector,
      text,
      surface,
      fg: hex(over) + (over.clipped ? "*" : ""),
      bg: hex(bg) + (bg.clipped ? "*" : ""),
      ratio,
      min,
      pass: ratio >= min,
    });
  }
}

const columns = [
  ["theme", (r) => r.theme],
  ["text token", (r) => r.text],
  ["surface", (r) => r.surface],
  ["text", (r) => r.fg],
  ["surface", (r) => r.bg],
  ["ratio", (r) => r.ratio.toFixed(2)],
  ["min", (r) => r.min.toFixed(1)],
  ["result", (r) => (r.pass ? "PASS" : "FAIL")],
];
const widths = columns.map(([head, cell]) => Math.max(head.length, ...rows.map((r) => cell(r).length)));
const line = (cells) =>
  cells
    .map((c, i) => c.padEnd(widths[i]))
    .join("  ")
    .trimEnd();

console.log(line(columns.map(([head]) => head)));
console.log(line(widths.map((w) => "-".repeat(w))));
for (const row of rows) console.log(line(columns.map(([, cell]) => cell(row))));

const failed = rows.filter((r) => !r.pass);
if (rows.some((r) => r.fg.endsWith("*") || r.bg.endsWith("*"))) {
  console.log("\n* out of the sRGB gamut; clamped before measuring");
}
if (failed.length > 0) {
  console.log(`\ncontrast: ${failed.length} of ${rows.length} pair(s) below threshold`);
  process.exit(1);
}
console.log(`\ncontrast: ok (${rows.length} pairs)`);
