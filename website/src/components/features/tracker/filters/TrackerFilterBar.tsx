import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { useState } from "react";

import { Filter } from "~/components/domain/filters";
import { ModeSelector } from "~/components/domain/selectors/ModeSelector";
import { FilterToggleCell } from "~/components/patterns/filter-bar/FilterCell";
import { Button } from "~/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "~/components/ui/collapsible";
import { SegmentedItem } from "~/components/ui/segmented";
import type { Dayjs } from "~/dayjs";
import { useHeroById } from "~/hooks/useAssetById";
import { useSeasons } from "~/hooks/useSeasons";
import { PATCHES } from "~/lib/constants";
import type { DateFilterAction, DateRange } from "~/lib/date-filter-preference";
import { type Mode, MODE_CONFIG } from "~/lib/game-mode";
import { dateRangeLabel } from "~/lib/seasons";
import type { ResultFilter } from "~/lib/tracker/compute";

export function TrackerFilterBar({
  mode,
  onModeChange,
  heroId,
  onHeroChange,
  result,
  onResultChange,
  startDate,
  endDate,
  onDateChange,
  resetRange,
}: {
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  heroId: number | null;
  onHeroChange: (heroId: number | null) => void;
  result: ResultFilter;
  onResultChange: (result: ResultFilter) => void;
  startDate?: Dayjs;
  endDate?: Dayjs;
  resetRange: DateRange;
  onDateChange: (startDate?: Dayjs, endDate?: Dayjs, action?: DateFilterAction) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { hero } = useHeroById(heroId ?? 0);
  const { seasons } = useSeasons();
  const dateLabel = dateRangeLabel({ startDate, endDate }, { seasons, patches: PATCHES });
  const heroLabel = heroId == null ? "Any hero" : (hero?.name ?? `Hero ${heroId}`);
  const modeLabel = mode === "normal_all" ? "All normal" : MODE_CONFIG[mode].label;
  const resultLabel = result === "all" ? "All results" : result === "win" ? "Wins" : "Losses";
  const summary = `${heroLabel} · ${modeLabel} · ${resultLabel}`;
  return (
    <Collapsible
      open={expanded}
      onOpenChange={setExpanded} // Full width, never shrink-to-fit: the bar inside is a query container, which has no intrinsic width of its own
      // and centres itself once it has room for one row.
      className="flex w-full flex-col gap-1"
    >
      <div className="flex items-center gap-1 lg:hidden">
        <CollapsibleTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="group h-auto min-h-10 min-w-0 flex-1 justify-start py-1.5 whitespace-normal"
            aria-label={`Filters: ${dateLabel}; ${summary}`}
          >
            <SlidersHorizontal data-icon="inline-start" />
            <span className="min-w-0 flex-1 text-start">
              <span className="block text-xs">{dateLabel}</span>
              <span className="block text-3xs wrap-anywhere text-muted-foreground">{summary}</span>
            </span>
            <ChevronDown data-icon="inline-end" className="group-data-[state=open]:rotate-180" />
          </Button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent
        forceMount
        className="data-[state=closed]:hidden lg:data-[state=closed]:block"
        // Keep a focused filter visible if a desktop window becomes a mobile layout.
        onFocusCapture={() => setExpanded(true)}
      >
        <div className="flex flex-col gap-1">
          <Filter.Root>
            {/* The two popover cells sit together so a phone pairs them on one row, ahead of the full-width toggles. */}
            <Filter.SeasonPatchDate
              value={{ startDate, endDate }}
              onValueChange={(next) => onDateChange(next.startDate, next.endDate, next.action)}
              defaultValue={{ startDate: resetRange[0], endDate: resetRange[1] }}
            />
            <Filter.Hero value={heroId} onValueChange={onHeroChange} allowNull />
            <ModeSelector value={mode} onValueChange={onModeChange} />
            <FilterToggleCell
              label="Result"
              value={result}
              defaultValue="all"
              onValueChange={onResultChange}
              width="wide"
            >
              <SegmentedItem value="all">All</SegmentedItem>
              <SegmentedItem value="win">Wins</SegmentedItem>
              <SegmentedItem value="loss">Losses</SegmentedItem>
            </FilterToggleCell>
          </Filter.Root>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
