import { CalendarIcon, ClockIcon } from "lucide-react";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { useEffect, useId } from "react";
import { FilterPill } from "~/components/FilterPill";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { day, type Dayjs } from "~/dayjs";
import { DateRangePicker } from "./primitives/DateRangePicker";

export interface PatchInfo {
  id: string;
  name: string;
  startDate: Dayjs;
  endDate: Dayjs | "NOW";
}

export interface PatchOrDatePickerProps {
  patchDates: PatchInfo[];
  value: { startDate?: Dayjs; endDate?: Dayjs };
  onValueChange: (value: { startDate?: Dayjs; endDate?: Dayjs }) => void;
  className?: string;
  defaultTab?: "patch" | "custom";
}

const resolveEndDate = (endDate: Dayjs | "NOW"): Dayjs => {
  return endDate === "NOW" ? day().endOf("day") : endDate;
};

export function PatchOrDatePicker({ patchDates, value, onValueChange, defaultTab = "patch" }: PatchOrDatePickerProps) {
  const [tab, setTab] = useQueryState(
    "pd-picker-tab",
    parseAsStringLiteral(["patch", "custom"] as const).withDefault(defaultTab),
  );

  const patchSelectId = useId();

  const matchingPatch = patchDates.find((patch) => {
    if (!value.startDate || !value.endDate) return false;
    const resolvedPatchStartDate = patch.startDate.startOf("day");
    const resolvedPatchEndDate = resolveEndDate(patch.endDate).endOf("day");
    return resolvedPatchStartDate.isSame(value.startDate, "day") && resolvedPatchEndDate.isSame(value.endDate, "day");
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: Meant to only run on start
  useEffect(() => {
    if (matchingPatch) {
      if (tab !== "patch") {
        setTab("patch");
      }
    } else if (value.startDate || value.endDate) {
      if (tab !== "custom") {
        setTab("custom");
      }
    } else {
      if (tab !== defaultTab) {
        setTab(defaultTab);
      }
    }
  }, []);

  const handlePatchSelect = (patchId: string) => {
    const selectedPatch = patchDates.find((p) => p.id === patchId);
    if (selectedPatch) {
      onValueChange({
        startDate: selectedPatch.startDate,
        endDate: resolveEndDate(selectedPatch.endDate),
      });
    } else {
      onValueChange({});
    }
  };

  const handleDateRangePickerChange = (range: { startDate?: Dayjs; endDate?: Dayjs }) => {
    onValueChange({
      startDate: range.startDate?.startOf("day"),
      endDate: range.endDate?.endOf("day"),
    });
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
        <Tabs defaultValue={defaultTab} value={tab} onValueChange={(value) => setTab(value as "patch" | "custom")}>
          <TabsList className="flex w-full">
            <TabsTrigger value="patch" className="text-xs flex-1 flex items-center gap-1">
              <ClockIcon className="h-3 w-3" />
              Patch
            </TabsTrigger>
            <TabsTrigger value="custom" className="text-xs flex-1 flex items-center gap-1">
              <CalendarIcon className="h-3 w-3" />
              Custom
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {tab === "patch" ? (
          <Select value={matchingPatch?.id || ""} onValueChange={handlePatchSelect}>
            <SelectTrigger id={patchSelectId} className="h-9 focus-visible:ring-0 w-full">
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
