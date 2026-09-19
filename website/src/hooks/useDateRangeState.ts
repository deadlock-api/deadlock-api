import { useQueryState } from "nuqs";
import { useMemo } from "react";

import { computePreviousPeriod } from "~/components/SeasonPatchDatePicker";
import type { Dayjs } from "~/dayjs";
import { useDateFilterPreference } from "~/hooks/useDateFilterPreference";
import { useSeasons } from "~/hooks/useSeasons";
import { PATCHES } from "~/lib/constants";
import type { DateFilterAction } from "~/lib/date-filter-preference";
import { parseAsDayjsRange } from "~/lib/nuqs-parsers";
import { defaultDateRange } from "~/lib/seasons";

/** Explicit URL range, otherwise the current season or patch chosen by the cookie. */
export function useDateRangeState() {
  const { seasons } = useSeasons();
  const { preference, selectPreference } = useDateFilterPreference();
  const [urlRange, setUrlRange] = useQueryState("date_range", parseAsDayjsRange);
  const defaultRange = useMemo(() => defaultDateRange(seasons, preference), [seasons, preference]);
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
    // Explicit picks stay in shared URLs, even when they match today's default.
    void setUrlRange(action === "reset" ? null : range);
  };

  return { startDate, endDate, prevStartDate, prevEndDate, handleDateChange, isDefaultRange, defaultRange };
}
