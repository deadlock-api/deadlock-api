import { ChartScatterIcon, ListIcon } from "lucide-react";
import { useState } from "react";

import { HeroName } from "~/components/HeroName";
import type { Recommendation, Swap } from "~/lib/team-builder/analysis";
import { deltaClass, formatPoints, formatRate } from "~/lib/team-builder/format";
import { laneOfSlot } from "~/lib/team-builder/lanes";
import { cn } from "~/lib/utils";

import { DeltaValue } from "./DeltaBar";
import { HeroPortrait } from "./HeroPortrait";
import { Panel, PanelHeader, PanelMessage, PanelShowMore, PanelSkeleton, PanelViewToggle } from "./Panel";
import { PickExplorer } from "./PickExplorer";
import { RecommendationTooltip } from "./RecommendationTooltip";
import { StatTooltip } from "./StatTooltip";

/** Matches the pairs panel so the two columns line up at rest. */
const COLLAPSED_ROWS = 8;
const MAX_ROWS = 30;

/**
 * Header and rows share this template so the columns stay locked together. The hero column carries a
 * floor because it is the only flexible track, and so the one that collapses in a narrow panel.
 */
const COLUMNS = "grid grid-cols-[1.25rem_minmax(5rem,1fr)_3.25rem_3.25rem_3.5rem] items-center gap-x-2 px-3";

/** Header and rows for the replacement view, which trades the stat columns for the outgoing hero. */
const SWAP_COLUMNS = "grid grid-cols-[1.25rem_minmax(0,1fr)_minmax(0,1fr)_3.5rem] items-center gap-x-2 px-3";

function SwapTooltip({ swap, children }: { swap: Swap; children: React.ReactNode }) {
  const lane = laneOfSlot(swap.slot);
  return (
    <StatTooltip
      title={
        <span className="flex flex-wrap items-center gap-1">
          <HeroName heroId={swap.in} /> <span className="text-muted-foreground">replaces</span>{" "}
          <HeroName heroId={swap.out} />
        </span>
      }
      rows={[
        { label: "Predicted win rate", value: formatPoints(swap.gain), className: deltaClass(swap.gain) },
        { label: "Lane", value: lane.name },
        { label: "Click to", value: "apply this swap" },
      ]}
    >
      {children}
    </StatTooltip>
  );
}

interface NextPickPanelProps {
  recommendations: Recommendation[];
  /** Ranked replacements, used when the side is full and there is nothing to pick *into*. */
  swaps: Swap[];
  hasOpenSlot: boolean;
  loading: boolean;
  onPick: (heroId: number) => void;
  onApplySwap: (swap: Swap) => void;
}

export function NextPickPanel({
  recommendations,
  swaps,
  hasOpenSlot,
  loading,
  onPick,
  onApplySwap,
}: NextPickPanelProps) {
  const [view, setView] = useState<"list" | "plot">("list");
  const [expanded, setExpanded] = useState(false);
  const top = recommendations.slice(0, expanded ? MAX_ROWS : COLLAPSED_ROWS);
  const topSwaps = swaps.slice(0, expanded ? MAX_ROWS : COLLAPSED_ROWS);

  // With every slot filled there is nothing to pick *into*, so the panel switches to swaps: each
  // row names the hero it would replace and applies that exact change.
  if (!hasOpenSlot && view === "list") {
    return (
      <Panel>
        <PanelHeader title="Best replacement" note="for your side">
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
        ) : topSwaps.length === 0 ? (
          <PanelMessage>No replacement improves this draft. Every slot is already the best fit found.</PanelMessage>
        ) : (
          <>
            <div
              className={cn(SWAP_COLUMNS, "border-b border-border py-2 text-[10px] text-muted-foreground uppercase")}
            >
              <span>#</span>
              <span>Bring in</span>
              <span>Replaces</span>
              <span className="text-right">Gain</span>
            </div>
            {topSwaps.map((swap, index) => (
              <SwapTooltip key={`${swap.slot}-${swap.in}`} swap={swap}>
                <button
                  type="button"
                  onClick={() => onApplySwap(swap)}
                  className={cn(
                    SWAP_COLUMNS,
                    "h-11 w-full cursor-pointer border-b border-border/60 text-left text-[13px] hover:bg-white/[0.03]",
                  )}
                >
                  <span className="text-muted-foreground tabular-nums">{index + 1}</span>
                  <span className="flex min-w-0 items-center gap-2">
                    <HeroPortrait heroId={swap.in} size="size-6.5" />
                    <HeroName heroId={swap.in} />
                  </span>
                  <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
                    <HeroPortrait heroId={swap.out} size="size-5" />
                    <HeroName heroId={swap.out} />
                  </span>
                  <DeltaValue value={swap.gain} className="text-right font-semibold" />
                </button>
              </SwapTooltip>
            ))}
            {swaps.length > COLLAPSED_ROWS && (
              <PanelShowMore
                expanded={expanded}
                total={Math.min(swaps.length, MAX_ROWS)}
                onToggle={() => setExpanded((open) => !open)}
              />
            )}
          </>
        )}
      </Panel>
    );
  }

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
          <div className={cn(COLUMNS, "border-b border-border py-2 text-[10px] text-muted-foreground uppercase")}>
            <span>#</span>
            <span>Hero</span>
            <span className="text-right">Syn pts</span>
            <span className="text-right">Vs pts</span>
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
