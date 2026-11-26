import { throttle, useQueryState } from "nuqs";
import { startTransition, useMemo } from "react";

import { type Dayjs, day } from "~/dayjs";
import { useDateFilterPreference } from "~/hooks/useDateFilterPreference";
import { usePeriodLists } from "~/hooks/usePeriodLists";
import type { DateFilterAction, DateRange } from "~/lib/date-filter-preference";
import {
  defaultPeriod as defaultPeriodOf,
  parseAsPeriod,
  type Period,
  periodBounds,
  periodRange,
  previousBounds,
  resolvePeriod,
} from "~/lib/period";

const toDay = (unix: number | undefined): Dayjs | undefined => (unix === undefined ? undefined : day.unix(unix));

/**
 * The page's period from `date_range` (`patch:<id>`, `season:<id>` or a custom `start_end`), otherwise
 * `fallbackPeriod`, otherwise the current season or patch chosen by the cookie. `fallbackPeriod` has to be
 * referentially stable.
 *
 * `startDate` / `endDate` and the previous period's `prevStartDate` / `prevEndDate` are the request bounds: a
 * patch's or season's exact instants, a custom range widened to whole UTC days. `range` is the period's own instants
 * (a custom range as picked), for copy and for views that filter by the exact instants.
 */
export function useDateRangeState(fallbackPeriod?: Period) {
  const lists = usePeriodLists();
  const { preference, selectPreference } = useDateFilterPreference();
  const [urlPeriod, setUrlPeriod] = useQueryState("date_range", parseAsPeriod);
  const defaultPeriod = useMemo(
    () => fallbackPeriod ?? defaultPeriodOf(lists, preference),
    [fallbackPeriod, lists, preference],
  );

  const resolved = useMemo(() => {
    const period = resolvePeriod(urlPeriod, lists, defaultPeriod);
    const range: DateRange = periodRange(period, lists) ?? [undefined, undefined];
    const bounds = periodBounds(period, lists);
    const previous = previousBounds(period, lists);
    return {
      period,
      range,
      startDate: toDay(bounds?.minUnixTimestamp),
      endDate: toDay(bounds?.maxUnixTimestamp),
      prevStartDate: toDay(previous?.minUnixTimestamp),
      prevEndDate: toDay(previous?.maxUnixTimestamp),
    };
  }, [urlPeriod, lists, defaultPeriod]);

  const handlePeriodChange = (next: Period, action: DateFilterAction = "custom") => {
    if (action === "season" || action === "patch") selectPreference(action);
    // Explicit picks stay in shared URLs, even when they match today's default. The page re-renders in a transition,
    // so the tap paints first; a debounced update (the app default) would defeat that, nuqs keeps it in a sync store.
    startTransition(() => void setUrlPeriod(action === "reset" ? null : next, { limitUrlUpdates: throttle(50) }));
  };

  return { ...resolved, defaultPeriod, handlePeriodChange };
}
