import { CalendarIcon, ClockIcon, TrophyIcon } from "lucide-react";
import { parseAsStringLiteral, useQueryState } from "nuqs";

import { DateRangePicker } from "~/components/patterns/filter-bar/DateRangePicker";
import { FilterCell } from "~/components/patterns/filter-bar/FilterCell";
import { useControllableState } from "~/components/ui/hooks/use-controllable-state";
import { OptionRow } from "~/components/ui/option-row";
import { Skeleton } from "~/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { day } from "~/dayjs";
import { usePeriodLists } from "~/hooks/usePeriodLists";
import { DEFAULT_DATE_FILTER, type DateFilterAction } from "~/lib/date-filter-preference";
import type { PatchEntry } from "~/lib/patches";
import {
  ALL_TIME,
  customPeriod,
  defaultPeriod,
  type Period,
  periodLabel,
  periodRange,
  periodsEqual,
} from "~/lib/period";
import { type SeasonInfo, seasonContaining } from "~/lib/seasons";

const TABS = ["patch", "season", "custom"] as const;
type PickerTab = (typeof TABS)[number];

interface SeasonPatchDatePickerProps extends Omit<
  React.ComponentProps<typeof FilterCell>,
  "label" | "value" | "defaultValue" | "active" | "onReset" | "icon" | "children"
> {
  value?: Period;
  /**
   * The period it starts at, and the one the reset returns to. Without it the picker starts at all time and resets to
   * the site's default period (`DEFAULT_DATE_FILTER`).
   */
  defaultValue?: Period;
  /** The picked period, and how: a season, a patch, custom dates, or the reset. */
  onValueChange?: (value: Period, action: DateFilterAction) => void;
  defaultTab?: PickerTab;
}

interface PatchGroup {
  label?: string;
  patches: PatchEntry[];
}

// Labelling each patch with the season it falls in is what keeps the two tabs
// from reading as competing, unrelated ways to slice time.
function groupPatchesBySeason(patches: readonly PatchEntry[], seasons: readonly SeasonInfo[]): PatchGroup[] {
  if (seasons.length === 0) return [{ patches: [...patches] }];
  const oldestSeason = seasons[seasons.length - 1];
  const groups: PatchGroup[] = [];
  for (const patch of patches) {
    const label = seasonContaining(seasons, day.unix(patch.startUnix))?.name ?? `Before ${oldestSeason.name}`;
    const lastGroup = groups.at(-1);
    if (lastGroup?.label === label) lastGroup.patches.push(patch);
    else groups.push({ label, patches: [patch] });
  }
  return groups;
}

function patchHint(patch: PatchEntry): string | undefined {
  if (patch.endUnix === undefined) return "current";
  return patch.kind === "hero" ? "hero" : undefined;
}

export function SeasonPatchDatePicker({
  value: valueProp,
  defaultValue,
  onValueChange,
  defaultTab = DEFAULT_DATE_FILTER,
  className,
  ...props
}: SeasonPatchDatePickerProps) {
  const [value, setValue] = useControllableState<Period>({
    value: valueProp,
    defaultValue: defaultValue ?? ALL_TIME,
  });
  const lists = usePeriodLists();
  const { seasons, patches, isPending: seasonsPending } = lists;

  const [queryTab, setQueryTab] = useQueryState(
    "pd-picker-tab",
    // Browsing the tabs is not a navigation: Back should not step through them.
    parseAsStringLiteral(TABS).withOptions({ history: "replace" }),
  );
  const valueTab: PickerTab | undefined =
    value.kind !== "custom" ? value.kind : value.start || value.end ? "custom" : undefined;
  const tab = queryTab ?? valueTab ?? defaultTab;

  const emit = (next: Period, action: DateFilterAction) => {
    setValue(next);
    onValueChange?.(next, action);
  };

  const resetTarget = defaultValue ?? defaultPeriod(lists);
  const isActive = !periodsEqual(value, resetTarget);
  // The custom tab opens on the dates of the patch or season picked, so a tweak starts from them.
  const [rangeStart, rangeEnd] = periodRange(value, lists) ?? [];

  return (
    <FilterCell
      label="Date"
      value={periodLabel(value, lists)}
      active={isActive}
      onReset={() => {
        emit(resetTarget, "reset");
        void setQueryTab(null);
      }}
      icon={<CalendarIcon className="size-3.5 shrink-0" />}
      className={className}
      contentClassName="w-auto p-3 lg:min-w-85"
      {...props}
    >
      <div className="flex flex-col gap-3">
        <Tabs value={tab} onValueChange={(value) => setQueryTab(value as PickerTab)}>
          <TabsList className="flex w-full">
            <TabsTrigger value="patch" className="flex flex-1 items-center gap-1 text-xs">
              <ClockIcon className="h-3 w-3" />
              Patch
            </TabsTrigger>
            <TabsTrigger value="season" className="flex flex-1 items-center gap-1 text-xs">
              <TrophyIcon className="h-3 w-3" />
              Season
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
                    selected={value.kind === "season" && value.id === season.id}
                    onClick={() => emit({ kind: "season", id: season.id }, "season")}
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
              {groupPatchesBySeason(patches, seasons).map((group) => (
                <div key={group.label ?? "patches"}>
                  {group.label && <div className="px-2 pt-2 pb-1 eyebrow first:pt-0">{group.label}</div>}
                  {group.patches.map((patch) => (
                    <OptionRow
                      key={patch.id}
                      selected={value.kind === "patch" && value.id === patch.id}
                      onClick={() => emit({ kind: "patch", id: patch.id }, "patch")}
                      hint={patchHint(patch)}
                    >
                      {patch.name}
                    </OptionRow>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* The calendar and the day presets hand over whole days, "Last 24h" an hour-aligned start. */}
        {tab === "custom" && (
          <DateRangePicker
            value={{ startDate: rangeStart, endDate: rangeEnd }}
            onValueChange={(range) => emit(customPeriod(range.startDate, range.endDate), "custom")}
          />
        )}
      </div>
    </FilterCell>
  );
}
