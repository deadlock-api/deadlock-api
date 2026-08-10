import { SeasonPatchDatePicker } from "~/components/SeasonPatchDatePicker";
import type { Dayjs } from "~/dayjs";
import { PATCHES } from "~/lib/constants";

import { createFilter } from "./createFilter";
import { formatDateRange } from "./utils";

export const SeasonPatchDateFilter = createFilter<{
  startDate?: Dayjs;
  endDate?: Dayjs;
  onDateChange: (startDate?: Dayjs, endDate?: Dayjs, prevStartDate?: Dayjs, prevEndDate?: Dayjs) => void;
  defaultTab?: "season" | "patch" | "custom";
}>({
  useDescription(props) {
    return {
      dateRange: formatDateRange(props.startDate, props.endDate),
    };
  },
  Render({ startDate, endDate, onDateChange, defaultTab }) {
    return (
      <SeasonPatchDatePicker
        patchDates={PATCHES}
        value={{ startDate, endDate }}
        onValueChange={({ startDate: s, endDate: e, prevStartDate, prevEndDate }) =>
          onDateChange(s, e, prevStartDate, prevEndDate)
        }
        defaultTab={defaultTab}
      />
    );
  },
});
