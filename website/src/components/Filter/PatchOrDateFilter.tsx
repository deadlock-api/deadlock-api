import { PatchOrDatePicker } from "~/components/PatchOrDatePicker";
import type { Dayjs } from "~/dayjs";
import { PATCHES } from "~/lib/constants";

import { createFilter } from "./createFilter";

function formatDateRange(startDate: Dayjs | null | undefined, endDate: Dayjs | null | undefined): string | null {
  if (!startDate && !endDate) return null;
  const fmt = (d: Dayjs) =>
    d.toDate().toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  const fmtShort = (d: Dayjs) => d.toDate().toLocaleDateString(undefined, { month: "short", day: "numeric" });

  if (startDate && endDate) {
    const sameYear = startDate.year() === endDate.year();
    if (sameYear) {
      return `${fmtShort(startDate)} - ${fmt(endDate)}`;
    }
    return `${fmt(startDate)} - ${fmt(endDate)}`;
  }
  if (startDate) return `since ${fmt(startDate)}`;
  if (endDate) return `until ${fmt(endDate)}`;
  return null;
}

export const PatchOrDateFilter = createFilter<{
  startDate?: Dayjs;
  endDate?: Dayjs;
  onDateChange: (startDate?: Dayjs, endDate?: Dayjs, prevStartDate?: Dayjs, prevEndDate?: Dayjs) => void;
  defaultTab?: "patch" | "custom";
}>({
  useDescription(props) {
    return {
      dateRange: formatDateRange(props.startDate, props.endDate),
    };
  },
  Render({ startDate, endDate, onDateChange, defaultTab }) {
    return (
      <PatchOrDatePicker
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
