import { throttle, useQueryState } from "nuqs";
import { startTransition, useMemo } from "react";

import type { Dayjs } from "~/dayjs";
import { useDateFilterPreference } from "~/hooks/useDateFilterPreference";
import { useSeasons } from "~/hooks/useSeasons";
import { PATCHES } from "~/lib/constants";
import type { DateFilterAction, DateRange } from "~/lib/date-filter-preference";
import { parseAsDayjsRange } from "~/lib/nuqs-parsers";
import { defaultDateRange, computePreviousPeriod } from "~/lib/seasons";

/**
 * Explicit URL range, otherwise `fallbackRange`, otherwise the current season or patch chosen by the cookie.
 * `fallbackRange` has to be referentially stable.
 */
export function useDateRangeState(fallbackRange?: DateRange) {
  const { seasons } = useSeasons();
  const { preference, selectPreference } = useDateFilterPreference();
  const [urlRange, setUrlRange] = useQueryState("date_range", parseAsDayjsRange);
  const defaultRange = useMemo(
    () => fallbackRange ?? defaultDateRange(seasons, preference),
    [fallbackRange, seasons, preference],
  );
  const [startDate, endDate] = urlRange ?? defaultRange;
  const isDefaultRange =
    startDate?.valueOf() === defaultRange[0]?.valueOf() && endDate?.valueOf() === defaultRange[1]?.valueOf();

  const { prevStartDate, prevEndDate } = useMemo(
    () => computePreviousPeriod(startDate, endDate, { seasons, patches: PATCHES }),
    [startDate, endDate, seasons],
  );

  const handleDateChange = (newStartDate?: Dayjs, newEndDate?: Dayjs, action: DateFilterAction = "custom") => {
    const range: [Dayjs | undefined, Dayjs | undefined] = [newStartDate, newEndDate];
    if (action === "season" || action === "patch") selectPreference(action);
    // Explicit picks stay in shared URLs, even when they match today's default. The page re-renders in a transition,
    // so the tap paints first; a debounced update (the app default) would defeat that, nuqs keeps it in a sync store.
    startTransition(() => void setUrlRange(action === "reset" ? null : range, { limitUrlUpdates: throttle(50) }));
  };

  return { startDate, endDate, prevStartDate, prevEndDate, handleDateChange, isDefaultRange, defaultRange };
}
