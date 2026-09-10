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
  const closed = rows.filter((row) => day.unix(row.bucket).add(1, unit).isBefore(now));
  return new Set(closed.map((row) => row.bucket)).size >= 2 ? closed : rows;
}
