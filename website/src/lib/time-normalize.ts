import { type Dayjs, day } from "~/dayjs";
import { PATCHES } from "~/lib/constants";

export type Granularity = "hour" | "day";

export const DEFAULT_GRANULARITY: Granularity = "day";

// Exact unix timestamps of every known patch boundary. Normalization exists to
// improve cache-key hit rate by collapsing nearby timestamps to a shared
// day/hour boundary. Patch ranges are already-fixed dates, so hit rate isn't a
// concern for them — we'd rather preserve the exact boundary for accuracy. A
// date matching one of these is passed through unnormalized.
const PATCH_BOUNDARY_UNIX = new Set<number>(
  PATCHES.flatMap((p) => (p.endDate ? [p.startDate.unix(), p.endDate.unix()] : [p.startDate.unix()])),
);

function isPatchBoundary(d: Dayjs): boolean {
  return PATCH_BOUNDARY_UNIX.has(d.unix());
}

export function roundedNow(granularity: Granularity = DEFAULT_GRANULARITY): Dayjs {
  return day.utc().startOf(granularity);
}

export function normalizeUnixFloor(d: Dayjs | undefined, granularity: Granularity = DEFAULT_GRANULARITY) {
  if (!d) return undefined;
  if (isPatchBoundary(d)) return d.unix();
  return d.utc().startOf(granularity).unix();
}

export function normalizeUnixCeil(d: Dayjs | undefined, granularity: Granularity = DEFAULT_GRANULARITY) {
  if (!d) return undefined;
  if (isPatchBoundary(d)) return d.unix();
  return d.utc().endOf(granularity).unix();
}
