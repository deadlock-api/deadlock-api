import type { StatFormat } from "~/lib/stat-format";

/**
 * A change between two values as the site shows it. A rate changes in points (2% to 3% is +0.010); anything else
 * changes relative to where it was (+50%). Rounded to the displayed tenth of a percent, so the arrow and colour agree
 * with the printed number.
 */
export function statDelta(format: StatFormat, value: number | null | undefined, prev: number | null | undefined) {
  if (value == null || prev == null) return null;
  if (format === "percent") return Math.round((value - prev) * 1000) / 1000;
  if (prev === 0) return null;
  return Math.round(((value - prev) / Math.abs(prev)) * 1000) / 1000;
}

export interface BadgeRange {
  min: number;
  max: number;
}

interface WinRow {
  wins: number;
  matches: number;
  /** The average badge bucket of a bucketed answer; absent rows count for every range. */
  bucket?: number | null;
}

function inRange(row: { bucket?: number | null }, range: BadgeRange | undefined): boolean {
  if (!range || row.bucket == null) return true;
  return row.bucket >= range.min && row.bucket <= range.max;
}

interface Tally {
  wins: number;
  matches: number;
}

/** Wins and matches per entity, summed over the rank buckets inside `range`. */
export function tallyBy<T extends WinRow>(
  rows: readonly T[],
  key: (row: T) => number,
  range?: BadgeRange,
): { byId: Map<number, Tally>; total: number } {
  const byId = new Map<number, Tally>();
  let total = 0;
  for (const row of rows) {
    if (!inRange(row, range)) continue;
    const id = key(row);
    const tally = byId.get(id) ?? { wins: 0, matches: 0 };
    tally.wins += row.wins;
    tally.matches += row.matches;
    byId.set(id, tally);
    total += row.matches;
  }
  return { byId, total };
}

export interface EntityChange {
  id: number;
  matches: number;
  prevMatches: number;
  winRate: number;
  pickRate: number;
  /** In points; null when the entity was missing or too rare before the patch. */
  winRateDelta: number | null;
  pickRateDelta: number | null;
  /** The standard error of each delta (two independent proportions), null with the delta. */
  winRateSE: number | null;
  pickRateSE: number | null;
  /** Not played at all before the patch: a new hero or item. */
  isNew: boolean;
}

interface CompareOptions {
  minMatches: number;
  /** Turns a share of all picks into a pick rate: 12 heroes per match, 1 for items (a share of all purchases). */
  pickRateMultiplier: number;
  /** Keeps only these ids (shop items); everything else still counts towards the pick rate base. */
  include?: (id: number) => boolean;
  /**
   * The pick rate's base in each window, instead of the tallies' own totals: player-matches for items, so the rate
   * reads as the share of builds with the item.
   */
  base?: { before: number; after: number };
}

/**
 * Before and after values per entity. Entities below `minMatches` after the patch are left out; below it before the
 * patch they stay but get no delta.
 */
export function compareTallies(
  before: ReturnType<typeof tallyBy>,
  after: ReturnType<typeof tallyBy>,
  { minMatches, pickRateMultiplier, include, base }: CompareOptions,
): EntityChange[] {
  const beforeTotal = base?.before ?? before.total;
  const afterTotal = base?.after ?? after.total;
  // Purchases, not builds: an item sold and bought back counts twice, so a share of builds is capped at all of them.
  const rate = (matches: number, total: number) => Math.min(pickRateMultiplier, (pickRateMultiplier * matches) / total);
  const changes: EntityChange[] = [];
  for (const [id, now] of after.byId) {
    if (include && !include(id)) continue;
    if (now.matches < minMatches || afterTotal === 0) continue;
    const prev = before.byId.get(id);
    const winRate = now.wins / now.matches;
    const pickRate = rate(now.matches, afterTotal);
    const comparable = prev !== undefined && prev.matches >= minMatches && beforeTotal > 0;
    const prevWinRate = comparable ? prev.wins / prev.matches : 0;
    // The pick rate is a share of all picks (or builds) scaled by the multiplier; its error scales the same way.
    const share = Math.min(1, now.matches / afterTotal);
    const prevShare = comparable ? Math.min(1, prev.matches / beforeTotal) : 0;
    changes.push({
      id,
      matches: now.matches,
      prevMatches: prev?.matches ?? 0,
      winRate,
      pickRate,
      winRateDelta: comparable ? round(winRate - prevWinRate) : null,
      pickRateDelta: comparable ? round(pickRate - rate(prev.matches, beforeTotal)) : null,
      winRateSE: comparable ? proportionsSE(winRate, now.matches, prevWinRate, prev.matches) : null,
      pickRateSE: comparable ? pickRateMultiplier * proportionsSE(share, afterTotal, prevShare, beforeTotal) : null,
      isNew: prev === undefined || prev.matches === 0,
    });
  }
  return changes;
}

/** The standard error of the difference of two independent proportions. */
function proportionsSE(p1: number, n1: number, p0: number, n0: number): number {
  return Math.sqrt((p1 * (1 - p1)) / n1 + (p0 * (1 - p0)) / n0);
}

/**
 * How sure a change has to be before the patch pages list it: 99%, two-sided. Stricter than the usual 95%, because a
 * patch page tests every hero and item at once, and at 95% two of forty unchanged heroes would show up by chance.
 */
export const Z_SIGNIFICANT = 2.576;

/** Whether a change is beyond what sampling alone explains. */
export function isSignificant(delta: number | null, se: number | null): boolean {
  return delta !== null && se !== null && se > 0 && Math.abs(delta) >= Z_SIGNIFICANT * se;
}

/** Rounded to the tenth of a point that is displayed. */
function round(points: number): number {
  return Math.round(points * 1000) / 1000;
}

/** The biggest significant gains and drops by a delta; entities without one, or within the noise, are left out. */
export function topMovers<T extends EntityChange>(
  changes: readonly T[],
  delta: (change: T) => number | null,
  se: (change: T) => number | null,
  count: number,
): { gains: T[]; drops: T[] } {
  const scored = changes.filter((change) => (delta(change) ?? 0) !== 0 && isSignificant(delta(change), se(change)));
  const byDelta = [...scored].sort((a, b) => (delta(b) ?? 0) - (delta(a) ?? 0));
  return {
    gains: byDelta.filter((change) => (delta(change) ?? 0) > 0).slice(0, count),
    drops: byDelta
      .filter((change) => (delta(change) ?? 0) < 0)
      .reverse()
      .slice(0, count),
  };
}

/** A change and its standard error. */
export interface Measured {
  delta: number;
  se: number;
}

/**
 * How differently a change landed in two rank bands, in points, when that difference is significant itself; null
 * when either band had too few matches or the bands agree within the noise. Top (Eternus) is not one of them: its
 * few hundred players swing a win rate by points from one week to the next.
 */
export function bandGap(bands: readonly (Measured | null)[], low: number, high: number): number | null {
  const a = bands[low];
  const b = bands[high];
  if (!a || !b) return null;
  const gap = Math.abs(b.delta - a.delta);
  return gap >= Z_SIGNIFICANT * Math.hypot(a.se, b.se) ? gap : null;
}

/** A rate counts as a big change from a point; anything else from 3% of its value. */
const BIG_POINTS = 0.01;
const BIG_RELATIVE = 0.03;

/** Two-sided 99% critical values of Student's t by degrees of freedom; the normal one past the table. */
const T_99: readonly [number, number][] = [
  [1, 63.66],
  [2, 9.925],
  [3, 5.841],
  [4, 4.604],
  [5, 4.032],
  [6, 3.707],
  [7, 3.499],
  [8, 3.355],
  [9, 3.25],
  [10, 3.169],
  [12, 3.055],
  [15, 2.947],
  [20, 2.845],
  [30, 2.75],
];

function tCritical(df: number): number {
  // The row at or below `df`: a slightly larger value, so a borderline change stays out.
  return T_99.findLast(([rowDf]) => rowDf <= df)?.[1] ?? (df > 30 ? Z_SIGNIFICANT : T_99[0][1]);
}

function meanAndVariance(values: readonly number[]): { mean: number; variance: number } {
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (values.length - 1);
  return { mean, variance };
}

/**
 * Whether the days after a patch differ from the days before beyond their day-to-day swing (Welch's t-test at 99%).
 * Needs two days on each side.
 */
export function daysDiffer(before: readonly number[], after: readonly number[]): boolean {
  if (before.length < 2 || after.length < 2) return false;
  const a = meanAndVariance(before);
  const b = meanAndVariance(after);
  const va = a.variance / before.length;
  const vb = b.variance / after.length;
  if (va + vb === 0) return a.mean !== b.mean;
  const t = Math.abs(b.mean - a.mean) / Math.sqrt(va + vb);
  const df = (va + vb) ** 2 / (va ** 2 / (before.length - 1) + vb ** 2 / (after.length - 1));
  return t >= tCritical(Math.floor(df));
}

interface DayRow {
  total_matches: number;
}

/** A stat's daily values, days without one left out. */
export function dailyValues<R extends DayRow>(rows: readonly R[], value: (row: R) => number | null | undefined) {
  return rows.flatMap((row) => {
    const v = value(row);
    return v == null || row.total_matches === 0 ? [] : [v];
  });
}

/** A per-match average over several days, each day weighted by its matches. */
export function pooledAverage<R extends DayRow>(
  rows: readonly R[],
  value: (row: R) => number | null | undefined,
): number | null {
  let sum = 0;
  let weight = 0;
  for (const row of rows) {
    const v = value(row);
    if (v == null) continue;
    sum += v * row.total_matches;
    weight += row.total_matches;
  }
  return weight === 0 ? null : sum / weight;
}

export interface StatChange<K> {
  key: K;
  before: number;
  after: number;
  delta: number;
}

/**
 * The stats a patch moved for real, biggest first: by at least a point (rates) or 3% (everything else), and beyond
 * the stat's own day-to-day swing. Rates are ranked by their change relative to their value too, so a point on a 5%
 * rate outranks a point on a 50% one.
 */
export function significantStatChanges<K extends string, R extends DayRow & Partial<Record<K, number | null>>>(
  stats: readonly { key: K; format: StatFormat }[],
  before: readonly R[],
  after: readonly R[],
  limit: number,
): StatChange<K>[] {
  return stats
    .flatMap((stat) => {
      const read = (row: R) => row[stat.key];
      const prev = pooledAverage(before, read);
      const value = pooledAverage(after, read);
      const delta = statDelta(stat.format, value, prev);
      if (delta === null || value === null || prev === null) return [];
      const isRate = stat.format === "percent";
      if (Math.abs(delta) < (isRate ? BIG_POINTS : BIG_RELATIVE)) return [];
      if (!daysDiffer(dailyValues(before, read), dailyValues(after, read))) return [];
      const size = isRate ? Math.abs(delta) / Math.max(Math.abs(value), Math.abs(prev)) : Math.abs(delta);
      return [{ key: stat.key, before: prev, after: value, delta, size }];
    })
    .sort((a, b) => b.size - a.size)
    .slice(0, limit)
    .map(({ size: _size, ...change }) => change);
}

/** Average souls per minute of a game: net worth over the game's length. */
export function soulsPerMinute(avgNetWorth: number | null | undefined, avgDurationS: number | null | undefined) {
  if (avgNetWorth == null || !avgDurationS) return null;
  return avgNetWorth / (avgDurationS / 60);
}
