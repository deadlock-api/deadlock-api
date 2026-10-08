// Patterns of the design-system lint (scripts/lint-design-system.mjs) that read code rather than class lists. They
// live here so their tests can import them without running the lint.

/**
 * A hand-typed dash where a value is missing:
 * - a dash that is an element's whole content: `<span>—</span>` (not a separator between elements);
 * - an em dash as a whole string value: `"—"`, except a prop set to one (`nullLabel="—"`, the prop's API);
 * - a hyphen or en dash as the fallback of `??`, `||`, `&&`, `return` or `=>`: `value ?? "-"`, `{a && "–"}`;
 * - a hyphen or en dash as the else branch of a ternary, unless the then branch is a one-character string too (a
 *   sign: `delta >= 0 ? "+" : "-"`).
 * Separators (`join("-")`), object and type literals (`{ sep: "-" }`, `"-" | "+"`) and signs are not placeholders.
 */
export const RAW_NO_VALUE =
  />\s*[—–-]\s*<\/|(?<![=\w])(["'`])—\1|(?:\?\?|\|\||&&|\breturn|=>)\s*(["'`])[–-]\2|\?(?!\s*(["'`])[^"'`\n]?\3\s*:)\s*[^?:\n]+:\s*(["'`])[–-]\4/g;

/** Whether `line` has a hand-typed dash placeholder. */
export function hasRawNoValue(line) {
  RAW_NO_VALUE.lastIndex = 0;
  return RAW_NO_VALUE.test(line);
}
