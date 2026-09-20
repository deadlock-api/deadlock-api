import { ChartScatterIcon, ListIcon } from "lucide-react";
import { Fragment, useState } from "react";

import { HeroCell } from "~/components/domain/assets/HeroCell";
import { HeroName } from "~/components/domain/assets/HeroName";
import type { GameMode } from "~/components/domain/selectors/GameModeSelector";
import { Panel, PanelBody, PanelHeader, PanelShowMore } from "~/components/patterns/panel/Panel";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { SkeletonRows } from "~/components/patterns/states/Skeletons";
import { Button } from "~/components/ui/button";
import { Segmented, SegmentedItem } from "~/components/ui/segmented";
import { Separator } from "~/components/ui/separator";
import type { Recommendation, Side, Swap } from "~/lib/team-builder/analysis";
import { deltaClass, formatPoints, formatRate } from "~/lib/team-builder/format";
import { slotLane } from "~/lib/team-builder/lanes";
import { cn } from "~/lib/utils";

import { PickExplorer } from "./PickExplorer";
import { Points } from "./Points";
import { RecommendationTooltip } from "./RecommendationTooltip";
import { SideToggle } from "./SideToggle";
import { StatTooltip } from "./StatTooltip";

/** Matches the pairs panel so the two columns line up at rest. */
const COLLAPSED_ROWS = 8;
const MAX_ROWS = 30;

/**
 * Header and rows share this template so the columns stay locked together. The hero column carries a
 * floor because it is the only flexible track, and so the one that collapses in a narrow panel.
 */
const COLUMNS = "grid grid-cols-[1.25rem_minmax(5rem,1fr)_3.25rem_3.25rem_3.5rem] items-center gap-x-2 px-3";

const ROW = "h-11";
const HEADER = "eyebrow py-2";

/** Header and rows for the replacement view, which trades the stat columns for the outgoing hero. */
const SWAP_COLUMNS = "grid grid-cols-[1.25rem_minmax(0,1fr)_minmax(0,1fr)_3.5rem] items-center gap-x-2 px-3";

function SwapTooltip({ swap, gameMode, children }: { swap: Swap; gameMode: GameMode; children: React.ReactNode }) {
  const lane = slotLane(gameMode, swap.slot);
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
        ...(lane ? [{ label: "Lane", value: lane.name }] : []),
        { label: "Click to", value: "apply this swap" },
      ]}
    >
      {children}
    </StatTooltip>
  );
}

interface NextPickPanelProps {
  gameMode: GameMode;
  recommendations: Record<Side, Recommendation[]>;
  /** Ranked replacements, used when the side is full and there is nothing to pick *into*. */
  swaps: Record<Side, Swap[]>;
  hasOpenSlot: Record<Side, boolean>;
  loading: boolean;
  onPick: (side: Side, heroId: number) => void;
  onApplySwap: (side: Side, swap: Swap) => void;
}

export function NextPickPanel({
  gameMode,
  recommendations,
  swaps,
  hasOpenSlot: openSlots,
  loading,
  onPick,
  onApplySwap,
}: NextPickPanelProps) {
  const [view, setView] = useState<"list" | "plot">("list");
  const [expanded, setExpanded] = useState(false);
  const [side, setSide] = useState<Side>("ally");
  const sideRecommendations = recommendations[side];
  const sideSwaps = swaps[side];
  const hasOpenSlot = openSlots[side];
  const top = sideRecommendations.slice(0, expanded ? MAX_ROWS : COLLAPSED_ROWS);
  const topSwaps = sideSwaps.slice(0, expanded ? MAX_ROWS : COLLAPSED_ROWS);

  // With every slot filled there is nothing to pick *into*, so the panel switches to swaps: each
  // row names the hero it would replace and applies that exact change.
  if (!hasOpenSlot && view === "list") {
    return (
      <Panel>
        <PanelHeader title="Best replacement">
          <SideToggle value={side} onValueChange={setSide} />
          <Segmented size="sm" width="hug" aria-label="View" value={view} onValueChange={setView}>
            <SegmentedItem value="list" aria-label="Ranked list" title="Ranked list">
              <ListIcon />
            </SegmentedItem>
            <SegmentedItem value="plot" aria-label="Synergy against counter plot" title="Synergy against counter plot">
              <ChartScatterIcon />
            </SegmentedItem>
          </Segmented>
        </PanelHeader>
        {loading ? (
          <PanelBody>
            <SkeletonRows rows={COLLAPSED_ROWS} />
          </PanelBody>
        ) : topSwaps.length === 0 ? (
          <EmptyState
            variant="inline"
            className="px-4 py-6"
            title="No replacement improves this draft. Every slot is already the best fit found."
          />
        ) : (
          <>
            <div className={cn(SWAP_COLUMNS, HEADER)}>
              <span>#</span>
              <span>Bring in</span>
              <span>Replaces</span>
              <span className="text-end">Gain</span>
            </div>
            <Separator />
            {topSwaps.map((swap, index) => (
              <Fragment key={`${swap.slot}-${swap.in}`}>
                <SwapTooltip swap={swap} gameMode={gameMode}>
                  <Button variant="row" onClick={() => onApplySwap(side, swap)} className={cn(ROW, SWAP_COLUMNS)}>
                    <span className="text-muted-foreground tabular-nums">{index + 1}</span>
                    <HeroCell heroId={swap.in} shape="circle" size="sm" />
                    <HeroCell heroId={swap.out} shape="circle" size="sm" className="text-muted-foreground" />
                    <Points value={swap.gain} align="end" className="font-semibold" />
                  </Button>
                </SwapTooltip>
                <Separator />
              </Fragment>
            ))}
            {sideSwaps.length > COLLAPSED_ROWS && (
              <PanelShowMore open={expanded} total={Math.min(sideSwaps.length, MAX_ROWS)} onOpenChange={setExpanded} />
            )}
          </>
        )}
      </Panel>
    );
  }

  return (
    <Panel>
      <PanelHeader title={hasOpenSlot ? "Best next pick" : "Best replacement"}>
        <SideToggle value={side} onValueChange={setSide} />
        <Segmented size="sm" width="hug" aria-label="View" value={view} onValueChange={setView}>
          <SegmentedItem value="list" aria-label="Ranked list" title="Ranked list">
            <ListIcon />
          </SegmentedItem>
          <SegmentedItem value="plot" aria-label="Synergy against counter plot" title="Synergy against counter plot">
            <ChartScatterIcon />
          </SegmentedItem>
        </Segmented>
      </PanelHeader>

      {loading ? (
        <PanelBody>
          <SkeletonRows rows={COLLAPSED_ROWS} />
        </PanelBody>
      ) : view === "plot" ? (
        <PickExplorer recommendations={sideRecommendations} onPick={(heroId) => onPick(side, heroId)} />
      ) : top.length === 0 ? (
        <EmptyState
          variant="inline"
          className="px-4 py-6"
          title="No candidate clears the minimum match count. Lower it in the filter bar."
        />
      ) : (
        <>
          <div className={cn(COLUMNS, HEADER)}>
            <span>#</span>
            <span>Hero</span>
            <span className="text-end">Syn pts</span>
            <span className="text-end">Vs pts</span>
            <span className="text-end">Win rate</span>
          </div>
          <Separator />
          {top.map((rec, index) => (
            <Fragment key={rec.heroId}>
              <RecommendationTooltip rec={rec}>
                <Button variant="row" onClick={() => onPick(side, rec.heroId)} className={cn(ROW, COLUMNS)}>
                  <span className="text-muted-foreground tabular-nums">{index + 1}</span>
                  <HeroCell heroId={rec.heroId} shape="circle" size="sm" />
                  <Points value={rec.synergy} align="end" className="font-semibold" />
                  <Points value={rec.counter} align="end" className="font-semibold" />
                  <span className="text-end tabular-nums">{formatRate(rec.winRate)}</span>
                </Button>
              </RecommendationTooltip>
              <Separator />
            </Fragment>
          ))}
          {sideRecommendations.length > COLLAPSED_ROWS && (
            <PanelShowMore
              open={expanded}
              total={Math.min(sideRecommendations.length, MAX_ROWS)}
              onOpenChange={setExpanded}
            />
          )}
        </>
      )}
    </Panel>
  );
}
