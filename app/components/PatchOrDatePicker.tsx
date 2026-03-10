import { CalendarIcon, ClockIcon } from "lucide-react";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { useId } from "react";

import { FilterPill } from "~/components/FilterPill";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { type Dayjs, day } from "~/dayjs";

import { DateRangePicker } from "./primitives/DateRangePicker";

export interface PatchInfo {
  id: string;
  name: string;
  startDate: Dayjs;
  endDate: Dayjs | "NOW";
}

export interface PatchOrDatePickerValue {
  startDate?: Dayjs;
  endDate?: Dayjs;
  prevStartDate?: Dayjs;
  prevEndDate?: Dayjs;
}

export interface PatchOrDatePickerProps {
  patchDates: PatchInfo[];
  value: { startDate?: Dayjs; endDate?: Dayjs };
  onValueChange: (value: PatchOrDatePickerValue) => void;
  className?: string;
  defaultTab?: "patch" | "custom";
}

export function computePreviousPeriod(
  startDate?: Dayjs,
  endDate?: Dayjs,
  patches?: PatchInfo[],
): { prevStartDate?: Dayjs; prevEndDate?: Dayjs } {
  if (!startDate || !endDate) return {};

  if (patches) {
    const patchIndex = patches.findIndex((p) => {
      const resolvedStart = p.startDate.startOf("day");
      const resolvedEnd = resolveEndDate(p.endDate).endOf("day");
      return resolvedStart.isSame(startDate, "day") && resolvedEnd.isSame(endDate, "day");
    });

    if (patchIndex >= 0 && patchIndex + 1 < patches.length) {
      const prevPatch = patches[patchIndex + 1];
      return {
        prevStartDate: prevPatch.startDate,
        prevEndDate: patches[patchIndex].startDate,
      };
    }
  }

  // Duration shift fallback
  const durationSeconds = endDate.unix() - startDate.unix();
  return {
    prevStartDate: startDate.subtract(durationSeconds, "second"),
    prevEndDate: startDate,
  };
}

const resolveEndDate = (endDate: Dayjs | "NOW"): Dayjs => {
  return endDate === "NOW" ? day().endOf("day") : endDate;
};

function inferTabFromValue({
  matchingPatch,
  startDate,
  endDate,
  defaultTab,
}: {
  matchingPatch?: PatchInfo;
  startDate?: Dayjs;
  endDate?: Dayjs;
  defaultTab: "patch" | "custom";
}): "patch" | "custom" {
  if (matchingPatch) return "patch";
  if (startDate || endDate) return "custom";
  return defaultTab;
}

export function PatchOrDatePicker({ patchDates, value, onValueChange, defaultTab = "patch" }: PatchOrDatePickerProps) {
  const patchSelectId = useId();

  const matchingPatch = patchDates.find((patch) => {
    if (!value.startDate || !value.endDate) return false;
    const resolvedPatchStartDate = patch.startDate.startOf("day");
    const resolvedPatchEndDate = resolveEndDate(patch.endDate).endOf("day");
    return resolvedPatchStartDate.isSame(value.startDate, "day") && resolvedPatchEndDate.isSame(value.endDate, "day");
  });

  const [queryTab, setQueryTab] = useQueryState("pd-picker-tab", parseAsStringLiteral(["patch", "custom"] as const));
  const tab =
    queryTab ??
    inferTabFromValue({
      matchingPatch,
      startDate: value.startDate,
      endDate: value.endDate,
      defaultTab,
    });

  const handlePatchSelect = (patchId: string) => {
    const selectedPatch = patchDates.find((p) => p.id === patchId);
    if (selectedPatch) {
      const startDate = selectedPatch.startDate;
      const endDate = resolveEndDate(selectedPatch.endDate);
      const prev = computePreviousPeriod(startDate, endDate, patchDates);
      onValueChange({ startDate, endDate, ...prev });
    } else {
      onValueChange({});
    }
  };

  const handleDateRangePickerChange = (range: { startDate?: Dayjs; endDate?: Dayjs }) => {
    const startDate = range.startDate?.startOf("day");
    const endDate = range.endDate?.endOf("day");
    const prev = computePreviousPeriod(startDate, endDate, patchDates);
    onValueChange({ startDate, endDate, ...prev });
  };

  const getDisplayValue = () => {
    if (!value.startDate && !value.endDate) return "All Time";
    if (matchingPatch) return matchingPatch.name;
    if (value.startDate && value.endDate) {
      return `${value.startDate.format("MMM D")} - ${value.endDate.format("MMM D")}`;
    }
    return "Custom";
  };

  const isActive = value.startDate != null || value.endDate != null;

  return (
    <FilterPill
      label="Date"
      value={getDisplayValue()}
      active={isActive}
      icon={<CalendarIcon className="size-3.5 shrink-0" />}
      className="w-auto min-w-[340px] p-3"
    >
      <div className="flex flex-col gap-3">
        <Tabs value={tab} onValueChange={(value) => setQueryTab(value as "patch" | "custom")}>
          <TabsList className="flex w-full">
            <TabsTrigger value="patch" className="flex flex-1 items-center gap-1 text-xs">
              <ClockIcon className="h-3 w-3" />
              Patch
            </TabsTrigger>
            <TabsTrigger value="custom" className="flex flex-1 items-center gap-1 text-xs">
              <CalendarIcon className="h-3 w-3" />
              Custom
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {tab === "patch" ? (
          <Select value={matchingPatch?.id || ""} onValueChange={handlePatchSelect}>
            <SelectTrigger id={patchSelectId} className="h-9 w-full focus-visible:ring-0">
              <SelectValue placeholder="Select a patch..." />
            </SelectTrigger>
            <SelectContent>
              {patchDates.map((patch) => (
                <SelectItem key={patch.id} value={patch.id}>
                  {patch.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <DateRangePicker
            startDate={value.startDate}
            endDate={value.endDate}
            onDateRangeChange={handleDateRangePickerChange}
          />
        )}
      </div>
    </FilterPill>
  );
}
