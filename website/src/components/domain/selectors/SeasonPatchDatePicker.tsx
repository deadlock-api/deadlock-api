import { CalendarIcon, ClockIcon, TrophyIcon } from "lucide-react";
import { parseAsStringLiteral, useQueryState } from "nuqs";

import { DateRangePicker } from "~/components/patterns/filter-bar/DateRangePicker";
import { FilterCell } from "~/components/patterns/filter-bar/FilterCell";
import { useControllableState } from "~/components/ui/hooks/use-controllable-state";
import { OptionRow } from "~/components/ui/option-row";
import { Skeleton } from "~/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import type { Dayjs } from "~/dayjs";
import { useSeasons } from "~/hooks/useSeasons";
import { PATCHES, type PatchInfo } from "~/lib/constants";
import type { DateFilterAction, DateRange } from "~/lib/date-filter-preference";
import {
  type SeasonInfo,
  computePreviousPeriod,
  dateRangeLabel,
  defaultDateRange,
  patchMatches,
  seasonContaining,
  seasonMatches,
} from "~/lib/seasons";

interface SeasonPatchDatePickerValue {
  action: DateFilterAction;
  startDate?: Dayjs;
  endDate?: Dayjs;
  prevStartDate?: Dayjs;
  prevEndDate?: Dayjs;
}

type DateValue = Pick<SeasonPatchDatePickerValue, "startDate" | "endDate">;

const ALL_TIME: DateValue = {};

const TABS = ["season", "patch", "custom"] as const;
type PickerTab = (typeof TABS)[number];

interface SeasonPatchDatePickerProps extends Omit<
  React.ComponentProps<typeof FilterCell>,
  "label" | "value" | "defaultValue" | "active" | "onReset" | "icon" | "children"
> {
  value?: DateValue;
  /**
   * The range it starts at, and the one the reset returns to. Without it the picker starts at all time and resets to
   * the current season.
   */
  defaultValue?: DateValue;
  onValueChange?: (value: SeasonPatchDatePickerValue) => void;
  defaultTab?: PickerTab;
  /** @deprecated Pass `defaultValue`. */
  resetRange?: DateRange;
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
  value: valueProp,
  defaultValue,
  onValueChange,
  defaultTab = "season",
  resetRange,
  className,
  ...props
}: SeasonPatchDatePickerProps) {
  const [value, setValue] = useControllableState<DateValue>({
    value: valueProp,
    defaultValue: defaultValue ?? ALL_TIME,
    // `emit` below is the only writer and always sends the full SeasonPatchDatePickerValue.
    onValueChange: onValueChange as ((value: DateValue) => void) | undefined,
  });
  const { seasons, isPending: seasonsPending } = useSeasons();

  const { startDate: valueStart, endDate: valueEnd } = value;
  const matchingSeason = valueStart ? seasons.find((season) => seasonMatches(season, valueStart, valueEnd)) : undefined;
  const matchingPatch =
    !matchingSeason && valueStart ? PATCHES.find((patch) => patchMatches(patch, valueStart, valueEnd)) : undefined;

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

  const emit = (startDate: Dayjs | undefined, endDate: Dayjs | undefined, action: DateFilterAction) => {
    const prev = computePreviousPeriod(startDate, endDate, { seasons, patches: PATCHES });
    const next: SeasonPatchDatePickerValue = { startDate, endDate, ...prev, action };
    setValue(next);
  };

  const handleSeasonSelect = (seasonId: string) => {
    const season = seasons.find((s) => s.id === seasonId);
    emit(season?.startDate, season?.endDate, "season");
  };

  const handlePatchSelect = (patchId: string) => {
    const patch = PATCHES.find((p) => p.id === patchId);
    emit(patch?.startDate, patch?.endDate, "patch");
  };

  const handleDateRangePickerChange = (range: { startDate?: Dayjs; endDate?: Dayjs }) => {
    emit(range.startDate?.startOf("day"), range.endDate?.endOf("day"), "custom");
  };

  const [defaultStart, defaultEnd] = defaultValue
    ? [defaultValue.startDate, defaultValue.endDate]
    : (resetRange ?? defaultDateRange(seasons));
  const isActive =
    value.startDate?.valueOf() !== defaultStart?.valueOf() || value.endDate?.valueOf() !== defaultEnd?.valueOf();

  return (
    <FilterCell
      label="Date"
      value={dateRangeLabel(value, { seasons, patches: PATCHES })}
      active={isActive}
      onReset={() => {
        emit(defaultStart, defaultEnd, "reset");
        setQueryTab(null);
      }}
      icon={<CalendarIcon className="size-3.5 shrink-0" />}
      className={className}
      contentClassName="w-auto p-3 lg:min-w-85"
      {...props}
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
              <Skeleton className="h-9" />
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
              {groupPatchesBySeason(PATCHES, seasons).map((group) => (
                <div key={group.label ?? "patches"}>
                  {group.label && <div className="px-2 pt-2 pb-1 eyebrow first:pt-0">{group.label}</div>}
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

        {tab === "custom" && <DateRangePicker value={value} onValueChange={handleDateRangePickerChange} />}
      </div>
    </FilterCell>
  );
}
