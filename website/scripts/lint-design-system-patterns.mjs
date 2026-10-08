// Patterns of the design-system lint (scripts/lint-design-system.mjs) that read code rather than class lists. They
// live here so their tests can import them without running the lint.

/**
 * A hand-typed dash where a value is missing:
 * - a dash that is an element's whole content: `<span>—</span>` (not a separator between elements);
 * - an em dash as a whole string value: `"—"`, except a prop set to one (`nullLabel="—"`, the prop's API);
 * - a hyphen or en dash as the fallback of `??`, `||`, `&&`, `return` or `=>`: `value ?? "-"`, `{a && "–"}`;
 * - a hyphen or en dash as the else branch of a ternary, on its line or on a line of its own (`  : "-"`,
 *   `) : "–"}`), unless the then branch is a sign (`delta >= 0 ? "+" : "-"`, also "±" and "−").
 * Separators (`join("-")`), object and type literals (`{ sep: "-" }`, `"-" | "+"`) and signs are not placeholders.
 */
export const RAW_NO_VALUE =
  />\s*[—–-]\s*<\/|(?<![=\w])(["'`])—\1|(?:\?\?|\|\||&&|\breturn|=>)\s*(["'`])[–-]\2|\?(?!\s*(["'`])[+±−]\3\s*:)\s*[^?:\n]+:\s*(["'`])[–-]\4|^\s*\)?\s*:\s*(["'`])[–-]\5/gm;

/** Whether `line` has a hand-typed dash placeholder. */
export function hasRawNoValue(line) {
  RAW_NO_VALUE.lastIndex = 0;
  return RAW_NO_VALUE.test(line);
}

/**
 * A CSS variable handed over as a color: a string that is one variable, named outright (`"var(--primary)"`), built
 * from a template (`` `var(--${tone})` ``, `` `var(--chart-${i})` ``) or concatenated (`"var(--chart-" + i + ")"`). A
 * template type (`` `var(--${string})` ``), a class's arbitrary value (`max-w-[var(--x)]`) and a variable with a
 * fallback computed from data (`` `var(--hero-opacity-${id}, 1)` ``) are not this.
 */
export const RAW_COLOR_VAR =
  /(["'`])var\(--[\w-]+\)\1|`var\(--[\w-]*\$\{(?!string\})[^}`]*\}[\w-]*\)`|(["'`])var\(--[\w-]*\2\s*\+/g;

/** Whether `line` hands over a CSS variable as a color. */
export function hasRawColorVar(line) {
  RAW_COLOR_VAR.lastIndex = 0;
  return RAW_COLOR_VAR.test(line);
}
