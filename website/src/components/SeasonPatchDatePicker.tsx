import { CalendarIcon, ClockIcon, TrophyIcon } from "lucide-react";
import { parseAsStringLiteral, useQueryState } from "nuqs";

import { FilterCell } from "~/components/Filter/FilterCell";
import { OptionRow } from "~/components/Filter/OptionRow";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import type { Dayjs } from "~/dayjs";
import { useSeasons } from "~/hooks/useSeasons";
import { type SeasonInfo, previousSeasonRange, seasonContaining } from "~/lib/seasons";

import { DateRangePicker } from "./primitives/DateRangePicker";

export interface PatchInfo {
  id: string;
  name: string;
  startDate: Dayjs;
  // Undefined = active patch (open-ended).
  endDate?: Dayjs;
}

export interface SeasonPatchDatePickerValue {
  startDate?: Dayjs;
  endDate?: Dayjs;
  prevStartDate?: Dayjs;
  prevEndDate?: Dayjs;
}

const TABS = ["season", "patch", "custom"] as const;
type PickerTab = (typeof TABS)[number];

export interface SeasonPatchDatePickerProps {
  patchDates: readonly PatchInfo[];
  value: { startDate?: Dayjs; endDate?: Dayjs };
  onValueChange: (value: SeasonPatchDatePickerValue) => void;
  className?: string;
  defaultTab?: PickerTab;
}

function patchMatches(patch: PatchInfo, startDate: Dayjs, endDate?: Dayjs): boolean {
  if (!patch.startDate.isSame(startDate, "day")) return false;
  if (patch.endDate === undefined) return endDate === undefined;
  return endDate !== undefined && patch.endDate.isSame(endDate, "day");
}

// Seasons match to the second, unlike patches: a season can begin on the same
// day as the patch that starts it, and day-granularity matching would then
// report the patch selection as its season.
function seasonMatches(season: SeasonInfo, startDate: Dayjs, endDate?: Dayjs): boolean {
  if (season.startDate.unix() !== startDate.unix()) return false;
  if (season.endDate === undefined) return endDate === undefined;
  return endDate !== undefined && season.endDate.unix() === endDate.unix();
}

export function computePreviousPeriod(
  startDate?: Dayjs,
  endDate?: Dayjs,
  ranges?: { seasons?: readonly SeasonInfo[]; patches?: readonly PatchInfo[] },
): { prevStartDate?: Dayjs; prevEndDate?: Dayjs } {
  if (!startDate) return {};

  const seasons = ranges?.seasons;
  if (seasons) {
    const seasonIndex = seasons.findIndex((season) => seasonMatches(season, startDate, endDate));
    if (seasonIndex >= 0) {
      const [prevStartDate, prevEndDate] = previousSeasonRange(seasons, seasonIndex);
      return { prevStartDate, prevEndDate };
    }
  }

  const patches = ranges?.patches;
  if (patches) {
    const patchIndex = patches.findIndex((patch) => patchMatches(patch, startDate, endDate));
    if (patchIndex >= 0 && patchIndex + 1 < patches.length) {
      const prevPatch = patches[patchIndex + 1];
      return {
        prevStartDate: prevPatch.startDate,
        prevEndDate: patches[patchIndex].startDate,
      };
    }
  }

  if (!endDate) return {};
  // Duration shift fallback for custom ranges.
  const durationSeconds = endDate.unix() - startDate.unix();
  return {
    prevStartDate: startDate.subtract(durationSeconds, "second"),
    prevEndDate: startDate,
  };
}

function inferTabFromValue({
  matchingSeason,
  matchingPatch,
  startDate,
  endDate,
  defaultTab,
}: {
  matchingSeason?: SeasonInfo;
  matchingPatch?: PatchInfo;
  startDate?: Dayjs;
  endDate?: Dayjs;
  defaultTab: PickerTab;
}): PickerTab {
  if (matchingSeason) return "season";
  if (matchingPatch) return "patch";
  if (startDate || endDate) return "custom";
  return defaultTab;
}

interface PatchGroup {
  label?: string;
  patches: PatchInfo[];
}

// Labelling each patch with the season it falls in is what keeps the two tabs
// from reading as competing, unrelated ways to slice time.
function groupPatchesBySeason(patches: readonly PatchInfo[], seasons: readonly SeasonInfo[]): PatchGroup[] {
  if (seasons.length === 0) return [{ patches: [...patches] }];
  const oldestSeason = seasons[seasons.length - 1];
  const groups: PatchGroup[] = [];
  for (const patch of patches) {
    const label = seasonContaining(seasons, patch.startDate)?.name ?? `Before ${oldestSeason.name}`;
    const lastGroup = groups.at(-1);
    if (lastGroup?.label === label) lastGroup.patches.push(patch);
    else groups.push({ label, patches: [patch] });
  }
  return groups;
}

export function SeasonPatchDatePicker({
  patchDates,
  value,
  onValueChange,
  defaultTab = "season",
}: SeasonPatchDatePickerProps) {
  const { seasons, isPending: seasonsPending } = useSeasons();

  const { startDate: valueStart, endDate: valueEnd } = value;
  const matchingSeason = valueStart ? seasons.find((season) => seasonMatches(season, valueStart, valueEnd)) : undefined;
  const matchingPatch =
    !matchingSeason && valueStart ? patchDates.find((patch) => patchMatches(patch, valueStart, valueEnd)) : undefined;

  const [queryTab, setQueryTab] = useQueryState("pd-picker-tab", parseAsStringLiteral(TABS));
  const tab =
    queryTab ??
    inferTabFromValue({
      matchingSeason,
      matchingPatch,
      startDate: value.startDate,
      endDate: value.endDate,
      defaultTab,
    });

  const emit = (startDate?: Dayjs, endDate?: Dayjs) => {
    const prev = computePreviousPeriod(startDate, endDate, { seasons, patches: patchDates });
    onValueChange({ startDate, endDate, ...prev });
  };

  const handleSeasonSelect = (seasonId: string) => {
    const season = seasons.find((s) => s.id === seasonId);
    emit(season?.startDate, season?.endDate);
  };

  const handlePatchSelect = (patchId: string) => {
    const patch = patchDates.find((p) => p.id === patchId);
    emit(patch?.startDate, patch?.endDate);
  };

  const handleDateRangePickerChange = (range: { startDate?: Dayjs; endDate?: Dayjs }) => {
    emit(range.startDate?.startOf("day"), range.endDate?.endOf("day"));
  };

  const getDisplayValue = () => {
    if (matchingSeason) return matchingSeason.name;
    if (matchingPatch) return matchingPatch.name;
    if (!value.startDate && !value.endDate) return "All Time";
    if (value.startDate && value.endDate) {
      return `${value.startDate.format("MMM D")} - ${value.endDate.format("MMM D")}`;
    }
    if (value.startDate) return `since ${value.startDate.format("MMM D")}`;
    if (value.endDate) return `until ${value.endDate.format("MMM D")}`;
    return "Custom";
  };

  const isActive = value.startDate != null || value.endDate != null;

  return (
    <FilterCell
      label="Date"
      value={getDisplayValue()}
      active={isActive}
      icon={<CalendarIcon className="size-3.5 shrink-0" />}
      className="w-auto p-3 lg:min-w-[340px]"
    >
      <div className="flex flex-col gap-3">
        <Tabs value={tab} onValueChange={(value) => setQueryTab(value as PickerTab)}>
          <TabsList className="flex w-full">
            <TabsTrigger value="season" className="flex flex-1 items-center gap-1 text-xs">
              <TrophyIcon className="h-3 w-3" />
              Season
            </TabsTrigger>
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

        {tab === "season" && (
          <div className="flex flex-col gap-1.5">
            {seasonsPending ? (
              <div className="h-9 animate-pulse rounded-md bg-muted" />
            ) : seasons.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Ranked seasons are unavailable right now. Pick a patch or a custom range instead.
              </p>
            ) : (
              <div className="flex max-h-64 flex-col overflow-y-auto">
                {seasons.map((season) => (
                  <OptionRow
                    key={season.id}
                    selected={matchingSeason?.id === season.id}
                    onClick={() => handleSeasonSelect(season.id)}
                    hint={season.endDate ? undefined : "current"}
                  >
                    {season.name}
                  </OptionRow>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "patch" && (
          <div className="flex flex-col gap-1.5">
            <div className="flex max-h-64 flex-col overflow-y-auto">
              {groupPatchesBySeason(patchDates, seasons).map((group) => (
                <div key={group.label ?? "patches"}>
                  {group.label && (
                    <div className="px-2 pt-2 pb-1 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase first:pt-0">
                      {group.label}
                    </div>
                  )}
                  {group.patches.map((patch) => (
                    <OptionRow
                      key={patch.id}
                      selected={matchingPatch?.id === patch.id}
                      onClick={() => handlePatchSelect(patch.id)}
                      hint={patch.endDate ? undefined : "current"}
                    >
                      {patch.name}
                    </OptionRow>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "custom" && (
          <DateRangePicker
            startDate={value.startDate}
            endDate={value.endDate}
            onDateRangeChange={handleDateRangePickerChange}
          />
        )}
      </div>
    </FilterCell>
  );
}
