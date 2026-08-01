import { useQueryState } from "nuqs";
import { useMemo, useState } from "react";

import type { Dayjs } from "~/dayjs";
import { useSeasons } from "~/hooks/useSeasons";
import { parseAsDayjsRange } from "~/lib/nuqs-parsers";
import { defaultDateRange, defaultPrevDateRange } from "~/lib/seasons";

/**
 * `date_range` URL state defaulting to the current ranked season, plus the
 * comparison range that goes with it. The previous period stays derived from
 * the default until the picker reports one, so it keeps up when the season list
 * only arrives after the first render.
 */
export function useDateRangeState() {
  const { seasons } = useSeasons();

  const defaultRange = useMemo(() => defaultDateRange(seasons), [seasons]);
  const parser = useMemo(() => parseAsDayjsRange.withDefault(defaultRange), [defaultRange]);
  const [[startDate, endDate], setDateRange] = useQueryState("date_range", parser);

  const [pickedPrev, setPickedPrev] = useState<{ prevStartDate?: Dayjs; prevEndDate?: Dayjs } | null>(null);
  const defaultPrev = useMemo(() => defaultPrevDateRange(seasons), [seasons]);
  const prevStartDate = pickedPrev ? pickedPrev.prevStartDate : defaultPrev[0];
  const prevEndDate = pickedPrev ? pickedPrev.prevEndDate : defaultPrev[1];

  const handleDateChange = (
    newStartDate?: Dayjs,
    newEndDate?: Dayjs,
    newPrevStartDate?: Dayjs,
    newPrevEndDate?: Dayjs,
  ) => {
    setDateRange([newStartDate, newEndDate]);
    setPickedPrev({ prevStartDate: newPrevStartDate, prevEndDate: newPrevEndDate });
  };

  return { startDate, endDate, prevStartDate, prevEndDate, setDateRange, handleDateChange };
}
