import type { HashMapValue } from "deadlock_api_client";

/** The percentiles a metric's summary carries, in order. */
export const percentilePoints = (values: HashMapValue): { p: number; v: number }[] => [
  { p: 1, v: values.percentile1 },
  { p: 5, v: values.percentile5 },
  { p: 10, v: values.percentile10 },
  { p: 25, v: values.percentile25 },
  { p: 50, v: values.percentile50 },
  { p: 75, v: values.percentile75 },
  { p: 90, v: values.percentile90 },
  { p: 95, v: values.percentile95 },
  { p: 99, v: values.percentile99 },
];

/**
 * The share of players (0-100) at or below `x`, interpolated linearly between the known percentiles. Outside
 * P1-P99 nothing is known beyond the side it falls on, so it clamps to 0 or 100; on a run of equal percentiles
 * (a metric that is mostly zero) the highest one holding that value wins, since that many players sit at or below it.
 */
export function approxPercentile(values: HashMapValue, x: number): number {
  const points = percentilePoints(values);
  if (x < points[0].v) return 0;
  if (x > points[points.length - 1].v) return 100;
  let at = points[0].p;
  for (let i = 0; i < points.length - 1; i++) {
    const lo = points[i];
    const hi = points[i + 1];
    if (x === hi.v) at = hi.p;
    else if (x > lo.v && x < hi.v) at = lo.p + ((x - lo.v) / (hi.v - lo.v)) * (hi.p - lo.p);
  }
  return at;
}

/** `approxPercentile` as a reader sees it: "≈ P40", or which end of the known range it lies past. */
export function formatPercentile(p: number): string {
  if (p < 1) return "below P1";
  if (p > 99) return "above P99";
  return `≈ P${Math.round(p)}`;
}

export interface CurvePoint {
  x: number;
  y: number;
}

/**
 * Approximates a KDE-style density curve from percentile summary stats (no raw samples
 * are available). Each bin between adjacent percentiles gets a density = probability
 * mass / bin width, plotted at the bin midpoint; Recharts' monotone curve smooths
 * between those points into a continuous silhouette.
 */
export function buildDistributionCurve(values: HashMapValue): CurvePoint[] {
  const points = percentilePoints(values);
  const curve: CurvePoint[] = [{ x: Math.min(0, values.percentile1), y: 0 }];
  for (let i = 0; i < points.length - 1; i++) {
    const width = points[i + 1].v - points[i].v;
    if (width <= 0) continue;
    const share = (points[i + 1].p - points[i].p) / 100;
    curve.push({ x: (points[i].v + points[i + 1].v) / 2, y: share / width });
  }
  curve.push({ x: Math.max(values.percentile99, values.avg) * 1.05 || 1, y: 0 });
  return curve;
}
