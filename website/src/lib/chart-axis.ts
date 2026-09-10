const TICK_STEPS = [0.01, 0.05, 0.1, 0.2];
const EPSILON = 1e-9;

/** Snaps a range of win-rate ratios outward to whole 5% steps. */
export function winRateDomain(values: number[]): [number, number] {
  return [Math.floor(Math.min(...values) * 20) / 20, Math.ceil(Math.max(...values) * 20) / 20];
}

/**
 * At most six ticks on round percentages inside a ratio domain. Recharts' default tick count splits a domain like
 * 35–60% evenly, which prints as unevenly rounded labels (35%, 42%, 48%, 55%).
 */
export function percentTicks([lo, hi]: [number, number]): number[] {
  const step = TICK_STEPS.find((s) => (hi - lo) / s <= 5 + EPSILON) ?? TICK_STEPS[TICK_STEPS.length - 1];
  const first = Math.ceil(lo / step - EPSILON);
  const last = Math.floor(hi / step + EPSILON);
  return Array.from({ length: last - first + 1 }, (_, i) => Number(((first + i) * step).toFixed(4)));
}

const COUNT_STEP_FACTORS = [1, 2, 2.5, 5, 10];

/**
 * Ticks from zero on a 1/2/2.5/5 × 10ⁿ step, at most `maxIntervals` apart, ending at or above `max`. Recharts'
 * own nice ticks round the step to 0.05 of its magnitude, which prints as 4,500 or 9,000 steps.
 */
export function countTicks(max: number, maxIntervals = 4): number[] {
  if (!(max > 0)) return [0];
  const magnitude = 10 ** Math.floor(Math.log10(max / maxIntervals));
  const step = magnitude * (COUNT_STEP_FACTORS.find((f) => magnitude * f * maxIntervals >= max) ?? 10);
  return Array.from({ length: Math.ceil(max / step - EPSILON) + 1 }, (_, i) => i * step);
}
