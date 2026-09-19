import { day } from "~/dayjs";

const BUCKET_UNIT = {
  start_time_hour: "hour",
  start_time_day: "day",
  start_time_week: "week",
  start_time_month: "month",
} as const;

/**
 * Drops rows in a start-time bucket that hasn't closed yet. Analytics are bucketed by match start, so an open bucket
 * only holds the matches that already ended: it undercounts totals and skews toward short games. The open bucket is
 * kept when fewer than two closed ones remain, e.g. monthly early in a season. Non-time buckets pass through.
 */
export function withoutOpenTimeBucket<T extends { bucket: number }>(rows: T[], interval: string): T[] {
  const unit = BUCKET_UNIT[interval as keyof typeof BUCKET_UNIT];
  if (!unit) return rows;
  const now = day();
  const seenBuckets = new Set<number>();
  const closedBuckets = new Set<number>();
  // Hero statistics repeat each timestamp across the roster. Calculate each boundary only once.
  for (const { bucket } of rows) {
    if (seenBuckets.has(bucket)) continue;
    seenBuckets.add(bucket);
    if (day.unix(bucket).add(1, unit).isBefore(now)) closedBuckets.add(bucket);
  }
  return closedBuckets.size >= 2 ? rows.filter((row) => closedBuckets.has(row.bucket)) : rows;
}

/** Only include buckets fully contained in the selected range and already closed in UTC. */
export function completeTimeBuckets<T extends { bucket: number }>(
  rows: T[],
  interval: string,
  { minUnixTimestamp, maxUnixTimestamp }: { minUnixTimestamp?: number | null; maxUnixTimestamp?: number | null } = {},
): T[] {
  const unit = BUCKET_UNIT[interval as keyof typeof BUCKET_UNIT];
  if (!unit) return rows;
  const end = Math.min(maxUnixTimestamp ?? Infinity, Date.now() / 1000);
  const complete = new Map<number, boolean>();
  return rows.filter(({ bucket }) => {
    if (!complete.has(bucket)) {
      complete.set(bucket, bucket >= (minUnixTimestamp ?? 0) && day.unix(bucket).utc().add(1, unit).unix() <= end);
    }
    return complete.get(bucket);
  });
}
