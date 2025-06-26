import { CalendarIcon, ClockIcon } from "lucide-react";
import { useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { type Dayjs, day } from "~/dayjs";
import { useQSString } from "~/hooks/useQSState";
import { DateRangePicker, type DateRangePickerProps } from "./primitives/DateRangePicker";

export interface PatchInfo {
  id: string; // Unique identifier for the patch
  name: string; // Display name, e.g., "Current Patch (05-08)"
  startDate: Dayjs;
  endDate: Dayjs | "NOW"; // Can be a specific date or "NOW"
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
  const [tab, setTab] = useQSString<"patch" | "custom">("pd-picker-tab", defaultTab);

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
      // If dates are set but don't match a patch, switch to custom
      // Only switch if not already on custom to avoid loops if defaultTab was custom
      if (tab !== "custom") {
        setTab("custom");
      }
    } else {
      // If no dates are set, revert to defaultTab or stay if already there
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
      // Handle case where "Select a patch" or an empty value is chosen
      onValueChange({});
    }
  };

  const handleDateRangePickerChange: DateRangePickerProps["onDateRangeChange"] = (range) => {
    onValueChange({
      startDate: range.startDate?.startOf("day"),
      endDate: range.endDate?.endOf("day"),
    });
  };

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <div className="flex items-center h-8">
            <span className="text-sm text-foreground font-semibold">Date Range</span>
          </div>
          <Tabs defaultValue={defaultTab} value={tab} onValueChange={(value) => setTab(value as "patch" | "custom")}>
            <TabsList className="flex h-8">
              <TabsTrigger value="patch" className="text-xs flex items-center gap-1">
                <ClockIcon className="h-3 w-3" />
                Patch
              </TabsTrigger>
              <TabsTrigger value="custom" className="text-xs flex items-center gap-1">
                <CalendarIcon className="h-3 w-3" />
                Custom
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div>
          {tab === "patch" ? (
            <Select value={matchingPatch?.id || ""} onValueChange={handlePatchSelect}>
              <SelectTrigger id="patch-select" className="h-10 focus-visible:ring-0 min-w-full">
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
      </div>
    </>
  );
}
