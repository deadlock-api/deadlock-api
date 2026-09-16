import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { useState } from "react";

import { Filter } from "~/components/Filter";
import { FilterToggleCell } from "~/components/Filter/FilterCell";
import { dateRangeLabel } from "~/components/SeasonPatchDatePicker";
import { type Mode, MODE_CONFIG, ModeSelector } from "~/components/selectors/ModeSelector";
import { Button } from "~/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "~/components/ui/collapsible";
import type { Dayjs } from "~/dayjs";
import { useHeroById } from "~/hooks/useAssetById";
import { useSeasons } from "~/hooks/useSeasons";
import { PATCHES } from "~/lib/constants";
import type { ResultFilter } from "~/lib/tracker/compute";

const RESULT_OPTIONS: { value: ResultFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "win", label: "Wins" },
  { value: "loss", label: "Losses" },
];

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
}: {
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  heroId: number | null;
  onHeroChange: (heroId: number | null) => void;
  result: ResultFilter;
  onResultChange: (result: ResultFilter) => void;
  startDate?: Dayjs;
  endDate?: Dayjs;
  onDateChange: (startDate?: Dayjs, endDate?: Dayjs, prevStartDate?: Dayjs, prevEndDate?: Dayjs) => void;
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
    <Collapsible open={expanded} onOpenChange={setExpanded} className="mx-auto flex w-full flex-col gap-1 lg:w-fit">
      <div className="flex items-center gap-1 lg:hidden">
        <CollapsibleTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="group h-auto min-h-10 min-w-0 flex-1 justify-start py-1.5 whitespace-normal"
            aria-label={`Filters: ${dateLabel}; ${summary}`}
          >
            <SlidersHorizontal data-icon="inline-start" />
            <span className="min-w-0 flex-1 text-left">
              <span className="block text-xs">{dateLabel}</span>
              <span className="block text-[10px] wrap-anywhere text-muted-foreground">{summary}</span>
            </span>
            <ChevronDown data-icon="inline-end" className="transition-transform group-data-[state=open]:rotate-180" />
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
            <Filter.SeasonPatchDate startDate={startDate} endDate={endDate} onDateChange={onDateChange} />
            <Filter.Hero value={heroId} onChange={onHeroChange} allowNull label="Hero" />
            <ModeSelector value={mode} onChange={onModeChange} />
            <FilterToggleCell
              label="Result"
              value={result}
              onValueChange={onResultChange}
              options={RESULT_OPTIONS}
              active={result !== "all"}
              onReset={() => onResultChange("all")}
            />
          </Filter.Root>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
