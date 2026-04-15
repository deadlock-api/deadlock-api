import { type Dayjs, day } from "~/dayjs";

export type Granularity = "hour" | "day";

export const DEFAULT_GRANULARITY: Granularity = "day";

export function roundedNow(granularity: Granularity = DEFAULT_GRANULARITY): Dayjs {
  return day.utc().startOf(granularity);
}

export function normalizeUnixFloor(d: Dayjs | undefined, granularity: Granularity = DEFAULT_GRANULARITY) {
  return d?.utc().startOf(granularity).unix();
}

export function normalizeUnixCeil(d: Dayjs | undefined, granularity: Granularity = DEFAULT_GRANULARITY) {
  return d?.utc().endOf(granularity).unix();
}
