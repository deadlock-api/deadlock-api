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
  /** Not played at all before the patch: a new hero or item. */
  isNew: boolean;
}

interface CompareOptions {
  minMatches: number;
  /** Turns a share of all picks into a pick rate: 12 heroes per match, 1 for items (a share of all purchases). */
  pickRateMultiplier: number;
  /** Keeps only these ids (shop items); everything else still counts towards the pick rate base. */
  include?: (id: number) => boolean;
}

/**
 * Before and after values per entity. Entities below `minMatches` after the patch are left out; below it before the
 * patch they stay but get no delta.
 */
export function compareTallies(
  before: ReturnType<typeof tallyBy>,
  after: ReturnType<typeof tallyBy>,
  { minMatches, pickRateMultiplier, include }: CompareOptions,
): EntityChange[] {
  const changes: EntityChange[] = [];
  for (const [id, now] of after.byId) {
    if (include && !include(id)) continue;
    if (now.matches < minMatches || after.total === 0) continue;
    const prev = before.byId.get(id);
    const winRate = now.wins / now.matches;
    const pickRate = (pickRateMultiplier * now.matches) / after.total;
    const comparable = prev !== undefined && prev.matches >= minMatches && before.total > 0;
    changes.push({
      id,
      matches: now.matches,
      prevMatches: prev?.matches ?? 0,
      winRate,
      pickRate,
      winRateDelta: comparable ? round(winRate - prev.wins / prev.matches) : null,
      pickRateDelta: comparable ? round(pickRate - (pickRateMultiplier * prev.matches) / before.total) : null,
      isNew: prev === undefined || prev.matches === 0,
    });
  }
  return changes;
}

/** Rounded to the tenth of a point that is displayed. */
function round(points: number): number {
  return Math.round(points * 1000) / 1000;
}

/** The biggest gains and drops by a delta, entities without one left out. */
export function topMovers(
  changes: readonly EntityChange[],
  delta: (change: EntityChange) => number | null,
  count: number,
): { gains: EntityChange[]; drops: EntityChange[] } {
  const scored = changes.filter((change) => (delta(change) ?? 0) !== 0);
  const byDelta = [...scored].sort((a, b) => (delta(b) ?? 0) - (delta(a) ?? 0));
  return {
    gains: byDelta.filter((change) => (delta(change) ?? 0) > 0).slice(0, count),
    drops: byDelta
      .filter((change) => (delta(change) ?? 0) < 0)
      .reverse()
      .slice(0, count),
  };
}

interface BucketedGameRow {
  bucket?: number | null;
  total_matches: number;
}

/** A per-match average across the rank buckets inside `range`, weighted by each bucket's matches. */
export function weightedAverage<T extends BucketedGameRow>(
  rows: readonly T[],
  value: (row: T) => number | null | undefined,
  range: BadgeRange,
): number | null {
  let sum = 0;
  let weight = 0;
  for (const row of rows) {
    if (!inRange(row, range)) continue;
    const v = value(row);
    if (v == null) continue;
    sum += v * row.total_matches;
    weight += row.total_matches;
  }
  return weight === 0 ? null : sum / weight;
}

/** Average souls per minute of a game: net worth over the game's length. */
export function soulsPerMinute(avgNetWorth: number | null | undefined, avgDurationS: number | null | undefined) {
  if (avgNetWorth == null || !avgDurationS) return null;
  return avgNetWorth / (avgDurationS / 60);
}
