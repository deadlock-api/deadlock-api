/** Tailwind's green-400 / red-400, which the draft palette is built around. */
export const GOOD_RGB = "74, 222, 128";
export const BAD_RGB = "248, 113, 113";

/** The dark ground the heat ramp passes through at zero, shared by the cells and their legend. */
export const HEAT_BASE = "#151b23";

/** What every Team Builder number prints when it has nothing to report. */
export const NO_DATA = "n/a";

/** A signed number of win-rate points, e.g. `+2.6`. */
export function formatPoints(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return NO_DATA;
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}`;
}

/** A rate in `[0,1]` as a percentage, e.g. `52.6%`. */
export function formatRate(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return NO_DATA;
  return `${(value * 100).toFixed(1)}%`;
}

export function formatCount(value: number | undefined): string {
  return value === undefined ? NO_DATA : value.toLocaleString();
}

export function deltaClass(value: number | undefined): string {
  if (value === undefined) return "text-muted-foreground";
  return value >= 0 ? "text-green-400" : "text-red-400";
}

/** `deltaClass` as a paintable colour, for bars that cannot take a text class. */
export function deltaBarColor(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return "transparent";
  return `rgb(${value >= 0 ? GOOD_RGB : BAD_RGB})`;
}

/** A bar anchored at the centre of its track, growing right for gains and left for losses. */
export function barGeometry(value: number | undefined, scale: number): { left: string; width: string } {
  if (value === undefined || !Number.isFinite(value)) return { left: "50%", width: "0%" };
  const t = Math.max(-1, Math.min(1, value / scale));
  return t >= 0 ? { left: "50%", width: `${t * 50}%` } : { left: `${50 + t * 50}%`, width: `${-t * 50}%` };
}

/** Heat fill for matrix cells: green above zero, red below, opacity scaled by magnitude. */
export function heatBackground(value: number | undefined, scale: number): string {
  if (value === undefined || !Number.isFinite(value)) {
    return `repeating-linear-gradient(45deg,#0f141a,#0f141a 3px,${HEAT_BASE} 3px,${HEAT_BASE} 6px)`;
  }
  const t = Math.max(-1, Math.min(1, value / scale));
  const rgb = t >= 0 ? GOOD_RGB : BAD_RGB;
  return `rgba(${rgb}, ${(0.08 + 0.32 * Math.abs(t)).toFixed(3)})`;
}

const CONFIDENCE_STEPS = [50, 200, 1_000, 5_000, 20_000];

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
