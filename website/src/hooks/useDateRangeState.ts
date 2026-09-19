import { useQueryState } from "nuqs";
import { useMemo } from "react";

import { computePreviousPeriod } from "~/components/SeasonPatchDatePicker";
import type { Dayjs } from "~/dayjs";
import { useDateFilterMemory } from "~/hooks/useDateFilterMemory";
import { useSeasons } from "~/hooks/useSeasons";
import { PATCHES } from "~/lib/constants";
import type { DateFilterAction } from "~/lib/date-filter-memory";
import { parseAsDayjsRange } from "~/lib/nuqs-parsers";
import { preferredDateRange } from "~/lib/seasons";

/** URL > remembered exact selection (24h) > current preferred season or patch. */
export function useDateRangeState() {
  const { seasons } = useSeasons();
  const { memory, remember } = useDateFilterMemory();
  const [urlRange, setUrlRange] = useQueryState("date_range", parseAsDayjsRange);
  const defaultRange = useMemo(() => preferredDateRange(seasons, memory.preference), [seasons, memory.preference]);
  const savedRange = useMemo(
    () => (memory.recent ? parseAsDayjsRange.parse(memory.recent.range) : null),
    [memory.recent],
  );
  const [startDate, endDate] = urlRange ?? savedRange ?? defaultRange;
  const isDefaultRange =
    startDate?.valueOf() === defaultRange[0]?.valueOf() && endDate?.valueOf() === defaultRange[1]?.valueOf();

  const { prevStartDate, prevEndDate } = useMemo(
    () => computePreviousPeriod(startDate, endDate, { seasons, patches: PATCHES }),
    [startDate, endDate, seasons],
  );

  const handleDateChange = (newStartDate?: Dayjs, newEndDate?: Dayjs, action: DateFilterAction = "custom") => {
    const range: [Dayjs | undefined, Dayjs | undefined] = [newStartDate, newEndDate];
    remember(range, action);
    // Explicit picks stay in shared URLs, even when they match today's default.
    void setUrlRange(action === "reset" ? null : range);
  };

  return { startDate, endDate, prevStartDate, prevEndDate, handleDateChange, isDefaultRange, defaultRange };
}
