import { TONE_COLOR, TONE_TEXT, toneOf } from "~/lib/tone";

/** What every Team Builder number prints when it has nothing to report. */
export const NO_DATA = "n/a";

/** A signed number of win-rate points, e.g. `+2.6`. The sign follows the rounded value, so `-0.04` prints `+0.0`. */
export function formatPoints(value: number | undefined, decimals = 1): string {
  if (value === undefined || !Number.isFinite(value)) return NO_DATA;
  const factor = 10 ** decimals;
  const rounded = Math.round(value * factor) / factor;
  return `${rounded >= 0 ? "+" : ""}${rounded.toFixed(decimals)}`;
}

/** A magnitude a few characters wide, e.g. `1.2k`, `10k`, `1.5M`. A tenth that rounds to zero is dropped. */
export function compactNumber(value: number): string {
  if (value < 1000) return String(value);
  return value.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 1 }).replace("K", "k");
}

/** A rate in `[0,1]` as a percentage, e.g. `52.6%`. */
export function formatRate(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return NO_DATA;
  return `${(value * 100).toFixed(1)}%`;
}

/**
 * Pinned to en-US: every other number here prints through `toFixed`, so a locale-grouped count would
 * render 1234 as "1.234" beside deltas that use "." as a decimal point. Also an SSR hazard.
 */
export function formatCount(value: number | undefined): string {
  return value === undefined ? NO_DATA : value.toLocaleString("en-US");
}

/** Rounded like `formatPoints`, so a value that prints `+0.0` reads as neutral rather than a gain or a loss. */
export function deltaClass(value: number | undefined): string {
  return TONE_TEXT[toneOf(value === undefined ? 0 : Math.round(value * 10) / 10)];
}

/** `deltaClass` as a paintable colour, for bars that cannot take a text class. */
export function deltaBarColor(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return "transparent";
  // The same rounding as the printed number, so a bar never contradicts a "+0.0" beside it.
  return TONE_COLOR[toneOf(Math.round(value * 10) / 10)];
}

/** Heat fill for matrix cells: positive above zero, negative below, opacity scaled by magnitude. */
export function heatBackground(value: number | undefined, scale: number): string {
  if (value === undefined || !Number.isFinite(value)) {
    return "repeating-linear-gradient(45deg,var(--card),var(--card) 3px,var(--muted) 3px,var(--muted) 6px)";
  }
  const t = Math.max(-1, Math.min(1, value / scale));
  const tone = t >= 0 ? TONE_COLOR.positive : TONE_COLOR.negative;
  return `color-mix(in srgb, ${tone} ${(8 + 32 * Math.abs(t)).toFixed(1)}%, transparent)`;
}

/** Calibrated to what a per-pairing sample reaches on one patch at a narrow rank band. */
const CONFIDENCE_STEPS = [20, 60, 150, 400, 1_000];

export const MAX_CONFIDENCE_PIPS = CONFIDENCE_STEPS.length;

/** Filled pips out of `MAX_CONFIDENCE_PIPS`: each step is roughly a quarter of the remaining uncertainty. */
export function confidencePips(matches: number): number {
  return CONFIDENCE_STEPS.filter((step) => matches >= step).length;
}

/** Colour-ramp bound for a set of edges: the largest magnitude present, rounded to a readable step. */
export function autoScale(values: (number | undefined)[], minimum = 2): number {
  const largest = Math.max(...values.filter((v): v is number => v !== undefined).map(Math.abs), 0);
  return Math.max(minimum, Math.ceil(largest * 2) / 2);
}
