import { SeasonPatchDatePicker } from "~/components/SeasonPatchDatePicker";
import type { Dayjs } from "~/dayjs";
import { PATCHES } from "~/lib/constants";

export function SeasonPatchDateFilter({
  startDate,
  endDate,
  onDateChange,
  defaultTab,
}: {
  startDate?: Dayjs;
  endDate?: Dayjs;
  onDateChange: (startDate?: Dayjs, endDate?: Dayjs, prevStartDate?: Dayjs, prevEndDate?: Dayjs) => void;
  defaultTab?: "season" | "patch" | "custom";
}) {
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
}
