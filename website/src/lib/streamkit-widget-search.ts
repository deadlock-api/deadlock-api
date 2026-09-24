/**
 * The OBS widget's query string, read the way the builder wrote it (`URLSearchParams`), not through the router's
 * JSON search parsing: that turned a prefix of "1.50 " into 1.5, a suffix of " null" into nothing and a label of
 * `"KD" ` into KD. Every value stays the exact string from the URL; the first of a repeated key wins.
 */
export function readWidgetSearch(search: string): Record<string, string> {
  const params: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(search)) {
    if (!(key in params)) params[key] = value;
  }
  return params;
}

/** A display flag: on unless the URL says `false`, and `fallback` when the URL leaves it out. */
export function readWidgetFlag(value: string | undefined, fallback: boolean): boolean {
  return value === undefined ? fallback : value !== "false";
}

/** A whole number clamped to `[min, max]`, or `fallback` when the URL leaves it out or it is not a number. */
export function readWidgetInt(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = value === undefined ? Number.NaN : Number.parseInt(value, 10);
  return Math.max(min, Math.min(max, Number.isNaN(parsed) ? fallback : parsed));
}
