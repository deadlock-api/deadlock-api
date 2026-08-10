import { ChartScatterIcon, ListIcon } from "lucide-react";
import { useState } from "react";

import { HeroName } from "~/components/HeroName";
import type { Recommendation } from "~/lib/team-builder/analysis";
import { formatRate } from "~/lib/team-builder/format";
import { cn } from "~/lib/utils";

import { DeltaValue } from "./DeltaBar";
import { HeroPortrait } from "./HeroPortrait";
import { Panel, PanelHeader, PanelMessage, PanelShowMore, PanelSkeleton, PanelViewToggle } from "./Panel";
import { PickExplorer } from "./PickExplorer";
import { RecommendationTooltip } from "./RecommendationTooltip";

/** Matches the pairs panel so the two columns line up at rest. */
const COLLAPSED_ROWS = 8;
const MAX_ROWS = 30;

/** Header and rows share this template so the columns stay locked together. */
const COLUMNS = "grid grid-cols-[1.25rem_minmax(0,1fr)_4rem_4rem_4rem] items-center gap-x-2 px-4";

interface NextPickPanelProps {
  recommendations: Recommendation[];
  hasOpenSlot: boolean;
  loading: boolean;
  onPick: (heroId: number) => void;
}

export function NextPickPanel({ recommendations, hasOpenSlot, loading, onPick }: NextPickPanelProps) {
  const [view, setView] = useState<"list" | "plot">("list");
  const [expanded, setExpanded] = useState(false);
  const top = recommendations.slice(0, expanded ? MAX_ROWS : COLLAPSED_ROWS);

  return (
    <Panel>
      <PanelHeader title={hasOpenSlot ? "Best next pick" : "Best replacement"} note="for your side">
        <PanelViewToggle
          value={view}
          onChange={setView}
          options={[
            { value: "list", label: "Ranked list", icon: ListIcon },
            { value: "plot", label: "Synergy against counter plot", icon: ChartScatterIcon },
          ]}
        />
      </PanelHeader>

      {loading ? (
        <PanelSkeleton rows={COLLAPSED_ROWS} />
      ) : view === "plot" ? (
        <PickExplorer recommendations={recommendations} onPick={onPick} />
      ) : top.length === 0 ? (
        <PanelMessage>No candidate clears the minimum match count. Lower it in the filter bar.</PanelMessage>
      ) : (
        <>
          <div
            className={cn(
              COLUMNS,
              "border-b border-border py-2 text-[11px] tracking-[0.05em] text-muted-foreground uppercase",
            )}
          >
            <span>#</span>
            <span>Hero</span>
            <span className="text-right">Synergy</span>
            <span className="text-right">Counter</span>
            <span className="text-right">Win rate</span>
          </div>
          {top.map((rec, index) => (
            <RecommendationTooltip key={rec.heroId} rec={rec}>
              <button
                type="button"
                onClick={() => onPick(rec.heroId)}
                className={cn(
                  COLUMNS,
                  "h-11 w-full cursor-pointer border-b border-border/60 text-left text-[13px] hover:bg-white/[0.03]",
                )}
              >
                <span className="text-muted-foreground tabular-nums">{index + 1}</span>
                <span className="flex min-w-0 items-center gap-2">
                  <HeroPortrait heroId={rec.heroId} size="size-6.5" />
                  <HeroName heroId={rec.heroId} />
                </span>
                <DeltaValue value={rec.synergy} className="text-right font-semibold" />
                <DeltaValue value={rec.counter} className="text-right font-semibold" />
                <span className="text-right tabular-nums">{formatRate(rec.winRate)}</span>
              </button>
            </RecommendationTooltip>
          ))}
          {recommendations.length > COLLAPSED_ROWS && (
            <PanelShowMore
              expanded={expanded}
              total={Math.min(recommendations.length, MAX_ROWS)}
              onToggle={() => setExpanded((open) => !open)}
            />
          )}
        </>
      )}
    </Panel>
  );
}
