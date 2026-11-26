import type { Dayjs } from "~/dayjs";

/**
 * The request bounds of dates `useDateRangeState` resolved: a patch's or a season's exact instants, a custom range
 * already widened to whole UTC days. No rounding happens here, so the bounds a page passes down stay exact.
 */
export function useNormalizedTimeRange(minDate: Dayjs | undefined, maxDate: Dayjs | undefined) {
  return { minUnixTimestamp: minDate?.unix(), maxUnixTimestamp: maxDate?.unix() };
}
