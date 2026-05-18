import type { Dayjs } from "~/dayjs";
import { type Granularity, normalizeUnixCeil, normalizeUnixFloor } from "~/lib/time-normalize";

export function useNormalizedTimeRange(
  minDate: Dayjs | undefined,
  maxDate: Dayjs | undefined,
  granularity?: Granularity,
) {
  return {
    minUnixTimestamp: normalizeUnixFloor(minDate, granularity),
    maxUnixTimestamp: normalizeUnixCeil(maxDate, granularity),
  };
}
