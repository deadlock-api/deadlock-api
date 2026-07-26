import { wilsonScoreInterval } from "./wilson";

export const PURCHASE_BUCKET_INCREMENTS = [1000, 2000, 3000, 5000, 7000, 10000] as const;

export interface PurchaseBucketRow {
  bucket: number | null;
  matches: number;
  wins: number;
}

export interface GroupedPurchaseBucket {
  bucketStart: number;
  bucketEnd: number;
  matches: number;
  wins: number;
  trueWinRate: number;
  wilsonLowerBound: number;
}

export interface PurchaseWindow {
  bucketStart: number;
  bucketEnd: number;
  matches: number;
  wins: number;
  trueWinRate: number;
  wilsonLowerBound: number;
}

export interface TierPurchaseSeries {
  tier: number;
  buckets: PurchaseBucketRow[];
}

const LOW_VOLUME_MATCHES = 200;
const NORMAL_AVERAGE_SHARE = 0.1;
const LOW_VOLUME_AVERAGE_SHARE = 0.15;
const MIN_WINDOW_MATCHES = 20;
const MIN_WINDOW_SHARE = 0.05;
const WINDOW_SCORE_TOLERANCE = 0.07;

function bucketKey(bucket: number, increment: number) {
  return Math.floor(bucket / increment) * increment;
}

export function computeAverageBucketMatches(rows: PurchaseBucketRow[], increment: number): number {
  const groups = groupPurchaseBuckets(rows, increment);
  if (groups.length === 0) return 0;
  return groups.reduce((sum, group) => sum + group.matches, 0) / groups.length;
}

export function chooseAdaptiveBucketIncrement(
  rows: PurchaseBucketRow[],
  rowTotalMatches: number,
  increments: readonly number[] = PURCHASE_BUCKET_INCREMENTS,
  averageShare = rowTotalMatches > LOW_VOLUME_MATCHES ? NORMAL_AVERAGE_SHARE : LOW_VOLUME_AVERAGE_SHARE,
): number {
  const fallback = increments.at(-1) ?? 1000;
  if (rowTotalMatches <= 0) return fallback;

  for (const increment of increments) {
    const averageMatches = computeAverageBucketMatches(rows, increment);
    if (averageMatches / rowTotalMatches >= averageShare) return increment;
  }

  return fallback;
}

export function groupPurchaseBuckets(rows: PurchaseBucketRow[], increment: number): GroupedPurchaseBucket[] {
  const groups = new Map<number, { matches: number; wins: number }>();

  for (const row of rows) {
    if (row.bucket == null || row.matches <= 0) continue;
    const key = bucketKey(row.bucket, increment);
    const group = groups.get(key) ?? { matches: 0, wins: 0 };
    group.matches += row.matches;
    group.wins += row.wins;
    groups.set(key, group);
  }

  return Array.from(groups.entries())
    .sort(([a], [b]) => a - b)
    .map(([key, group]) => {
      const [wilsonLowerBound] = wilsonScoreInterval(group.wins, group.matches);
      return {
        bucketStart: key,
        bucketEnd: key + increment,
        matches: group.matches,
        wins: group.wins,
        trueWinRate: group.wins / group.matches,
        wilsonLowerBound,
      };
    });
}

function weightedMedianPurchaseNetWorth(rows: PurchaseBucketRow[]): number | null {
  const sorted = rows
    .filter((row): row is PurchaseBucketRow & { bucket: number } => row.bucket != null && row.matches > 0)
    .sort((a, b) => a.bucket - b.bucket);
  const totalMatches = sorted.reduce((sum, row) => sum + row.matches, 0);
  if (totalMatches === 0) return null;

  let runningMatches = 0;
  for (const row of sorted) {
    runningMatches += row.matches;
    if (runningMatches >= totalMatches / 2) {
      // The API bucket is the lower bound of a 1k interval.
      return row.bucket + 500;
    }
  }

  return null;
}

export function calculateTierHorizons(series: TierPurchaseSeries[]): Map<number, number> {
  const byTier = new Map<number, PurchaseBucketRow[]>();
  for (const item of series) {
    const rows = byTier.get(item.tier) ?? [];
    rows.push(...item.buckets);
    byTier.set(item.tier, rows);
  }

  const horizons = new Map<number, number>();
  for (const [tier, rows] of byTier) {
    const median = weightedMedianPurchaseNetWorth(rows);
    if (median == null) continue;
    horizons.set(tier, Math.ceil((median * 2) / 1000) * 1000);
  }
  return horizons;
}

function aggregateWindow(groups: GroupedPurchaseBucket[], startIndex: number, endIndex: number): PurchaseWindow {
  const selected = groups.slice(startIndex, endIndex + 1);
  const matches = selected.reduce((sum, group) => sum + group.matches, 0);
  const wins = selected.reduce((sum, group) => sum + group.wins, 0);
  const [wilsonLowerBound] = wilsonScoreInterval(wins, matches);

  return {
    bucketStart: selected[0].bucketStart,
    bucketEnd: selected.at(-1)?.bucketEnd ?? selected[0].bucketEnd,
    matches,
    wins,
    trueWinRate: matches > 0 ? wins / matches : 0,
    wilsonLowerBound,
  };
}

function rangesOverlap(a: PurchaseWindow, b: PurchaseWindow) {
  return a.bucketStart < b.bucketEnd && b.bucketStart < a.bucketEnd;
}

export function selectPurchaseWindows(
  groups: GroupedPurchaseBucket[],
  horizon: number,
  totalBucketMatches = groups.reduce((sum, group) => sum + group.matches, 0),
): PurchaseWindow[] {
  const minMatches = Math.max(MIN_WINDOW_MATCHES, Math.ceil(totalBucketMatches * MIN_WINDOW_SHARE));
  const eligible = groups.filter((group) => group.bucketEnd <= horizon && group.matches >= minMatches);
  if (eligible.length === 0) return [];

  const peakIndexes = eligible
    .map((group, index) => {
      const previous = eligible[index - 1];
      const next = eligible[index + 1];
      const touchesPrevious = previous?.bucketEnd === group.bucketStart;
      const touchesNext = group.bucketEnd === next?.bucketStart;
      const previousScore = touchesPrevious ? previous.wilsonLowerBound : Number.NEGATIVE_INFINITY;
      const nextScore = touchesNext ? next.wilsonLowerBound : Number.NEGATIVE_INFINITY;
      return group.wilsonLowerBound >= previousScore && group.wilsonLowerBound >= nextScore ? index : null;
    })
    .filter((index): index is number => index != null);

  const candidates = new Map<string, PurchaseWindow>();
  for (const peakIndex of peakIndexes) {
    const peak = eligible[peakIndex];
    const floor = peak.wilsonLowerBound - WINDOW_SCORE_TOLERANCE;
    let startIndex = peakIndex;
    let endIndex = peakIndex;

    while (
      startIndex > 0 &&
      eligible[startIndex - 1].bucketEnd === eligible[startIndex].bucketStart &&
      eligible[startIndex - 1].wilsonLowerBound >= floor
    ) {
      startIndex--;
    }
    while (
      endIndex < eligible.length - 1 &&
      eligible[endIndex].bucketEnd === eligible[endIndex + 1].bucketStart &&
      eligible[endIndex + 1].wilsonLowerBound >= floor
    ) {
      endIndex++;
    }

    const candidate = aggregateWindow(eligible, startIndex, endIndex);
    candidates.set(`${candidate.bucketStart}:${candidate.bucketEnd}`, candidate);
  }

  const selected: PurchaseWindow[] = [];
  for (const candidate of Array.from(candidates.values()).sort(
    (a, b) => b.wilsonLowerBound - a.wilsonLowerBound || b.matches - a.matches,
  )) {
    if (selected.some((window) => rangesOverlap(window, candidate))) continue;
    selected.push(candidate);
    if (selected.length === 2) break;
  }

  return selected.sort((a, b) => a.bucketStart - b.bucketStart);
}

export function analyzePurchaseWindows(
  rows: PurchaseBucketRow[],
  rowTotalMatches: number,
  horizon: number,
): PurchaseWindow[] {
  const increment = chooseAdaptiveBucketIncrement(rows, rowTotalMatches);
  const groups = groupPurchaseBuckets(rows, increment);
  const totalBucketMatches = rows.reduce((sum, row) => sum + row.matches, 0);
  return selectPurchaseWindows(groups, horizon, totalBucketMatches);
}

export function formatPurchaseWindow(window: Pick<PurchaseWindow, "bucketStart" | "bucketEnd">): string {
  const start = Math.round(window.bucketStart / 1000);
  const end = Math.round(window.bucketEnd / 1000);
  return `${start}–${end}k`;
}

export function formatPurchaseWindows(windows: PurchaseWindow[]): string {
  if (windows.length === 0) return "No reliable window";
  return windows.map(formatPurchaseWindow).join(" • ");
}
