import { useQueryState } from "nuqs";
import { useMemo } from "react";

import { computePreviousPeriod } from "~/components/SeasonPatchDatePicker";
import type { Dayjs } from "~/dayjs";
import { useSeasons } from "~/hooks/useSeasons";
import { PATCHES } from "~/lib/constants";
import { parseAsDayjsRange } from "~/lib/nuqs-parsers";
import { defaultDateRange } from "~/lib/seasons";

/**
 * `date_range` URL state defaulting to the current ranked season, plus the
 * comparison range that goes with it. The previous period is derived from the
 * URL range on every render, the same way the picker derives it, so a shared or
 * reloaded link compares against the same baseline as a fresh pick, and the
 * default keeps up when the season list only arrives after the first render.
 */
export function useDateRangeState() {
  const { seasons } = useSeasons();

  const defaultRange = useMemo(() => defaultDateRange(seasons), [seasons]);
  const parser = useMemo(() => parseAsDayjsRange.withDefault(defaultRange), [defaultRange]);
  const [[startDate, endDate], setDateRange] = useQueryState("date_range", parser);

  const { prevStartDate, prevEndDate } = useMemo(
    () => computePreviousPeriod(startDate, endDate, { seasons, patches: PATCHES }),
    [startDate, endDate, seasons],
  );

  const handleDateChange = (newStartDate?: Dayjs, newEndDate?: Dayjs) => {
    setDateRange([newStartDate, newEndDate]);
  };

  return { startDate, endDate, prevStartDate, prevEndDate, setDateRange, handleDateChange };
}
