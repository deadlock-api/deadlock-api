import { SeasonPatchDatePicker } from "~/components/SeasonPatchDatePicker";
import type { Dayjs } from "~/dayjs";
import { PATCHES } from "~/lib/constants";
import type { DateFilterAction, DateRange } from "~/lib/date-filter-memory";

export function SeasonPatchDateFilter({
  startDate,
  endDate,
  onDateChange,
  defaultTab,
  resetRange,
}: {
  startDate?: Dayjs;
  endDate?: Dayjs;
  onDateChange: (startDate?: Dayjs, endDate?: Dayjs, action?: DateFilterAction) => void;
  resetRange: DateRange;
  defaultTab?: "season" | "patch" | "custom";
}) {
  return (
    <SeasonPatchDatePicker
      patchDates={PATCHES}
      value={{ startDate, endDate }}
      onValueChange={({ startDate: s, endDate: e, action }) => onDateChange(s, e, action)}
      resetRange={resetRange}
      defaultTab={defaultTab}
    />
  );
}
