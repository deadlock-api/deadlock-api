import type { Dayjs } from "~/dayjs";

export type Granularity = "hour" | "day";

export const DEFAULT_GRANULARITY: Granularity = "day";

// A custom date range is widened to whole UTC days (or hours) before it becomes a request, so nearby picks share a
// cache key and the day rollups answer them. A patch's or a season's bounds are exact instead: `periodBounds` (in
// period.ts) decides by the period, never by the instant.

export function normalizeUnixFloor(d: Dayjs | undefined, granularity: Granularity = DEFAULT_GRANULARITY) {
  if (!d) return undefined;
  return d.utc().startOf(granularity).unix();
}

export function normalizeUnixCeil(d: Dayjs | undefined, granularity: Granularity = DEFAULT_GRANULARITY) {
  if (!d) return undefined;
  return d.utc().endOf(granularity).unix();
}
