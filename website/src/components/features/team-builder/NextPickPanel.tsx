import { ChartScatterIcon, ListIcon } from "lucide-react";
import { useState } from "react";

import { HeroCell } from "~/components/domain/assets/HeroCell";
import { HeroName } from "~/components/domain/assets/HeroName";
import { Panel, PanelBody, PanelHeader, PanelShowMore } from "~/components/patterns/panel/Panel";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { SkeletonRows } from "~/components/patterns/states/Skeletons";
import { Button } from "~/components/ui/button";
import { useListNavigation } from "~/components/ui/hooks/use-list-navigation";
import { Segmented, SegmentedItem } from "~/components/ui/segmented";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableRowHeader } from "~/components/ui/table";
import type { GameMode } from "~/lib/game-mode";
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

/** The rank gives way first in a narrow panel: the order already says it. */
const RANK_CELL = "hidden w-6 text-end text-muted-foreground tabular-nums @sm/next-pick:table-cell";

/** The row's name cell takes the width the numbers leave and truncates in it; the swap view splits it in two. */
const NAME_CELL = "w-full max-w-0";
const HALF_NAME_CELL = "w-1/2 max-w-0";

/**
 * Picks the row's action from anywhere on the row and puts the focus on its button, so the arrow keys go on from
 * there.
 */
const rowClick = (action: () => void) => (event: React.MouseEvent<HTMLTableRowElement>) => {
  action();
  event.currentTarget.querySelector<HTMLElement>("[data-list-index]")?.focus({ preventScroll: true });
};

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
  const [cursor, setCursor] = useState(0);
  const sideRecommendations = recommendations[side];
  const sideSwaps = swaps[side];
  const hasOpenSlot = openSlots[side];
  const top = sideRecommendations.slice(0, expanded ? MAX_ROWS : COLLAPSED_ROWS);
  const topSwaps = sideSwaps.slice(0, expanded ? MAX_ROWS : COLLAPSED_ROWS);

  // With every slot filled there is nothing to pick *into*, so the list switches to swaps: each row names the hero it
  // would replace and applies that exact change.
  const showSwaps = !hasOpenSlot && view === "list";
  const navigation = useListNavigation({
    count: showSwaps ? topSwaps.length : top.length,
    value: cursor,
    onValueChange: setCursor,
  });

  return (
    <Panel className="@container/next-pick">
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
      ) : showSwaps && topSwaps.length === 0 ? (
        <EmptyState
          variant="inline"
          className="px-4 py-6"
          title="No replacement improves this draft. Every slot is already the best fit found."
        />
      ) : showSwaps ? (
        <>
          <Table density="dense" aria-label={hasOpenSlot ? "Best next pick" : "Best replacement"}>
            <TableHeader>
              <TableRow>
                <TableHead tone="muted" className={RANK_CELL}>
                  #
                </TableHead>
                <TableHead tone="muted">Bring in</TableHead>
                <TableHead tone="muted">Replaces</TableHead>
                <TableHead tone="muted" className="text-end">
                  Gain
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody onKeyDown={navigation.onKeyDown}>
              {topSwaps.map((swap, index) => (
                <TableRow
                  key={`${swap.slot}-${swap.in}`}
                  data-interactive=""
                  onClick={rowClick(() => onApplySwap(side, swap))}
                >
                  <TableCell className={RANK_CELL}>{index + 1}</TableCell>
                  <TableRowHeader className={HALF_NAME_CELL}>
                    <SwapTooltip swap={swap} gameMode={gameMode}>
                      <Button
                        variant="text"
                        size="inline"
                        {...navigation.getItemProps(index)}
                        className="max-w-full justify-start"
                        onClick={(event) => {
                          event.stopPropagation();
                          onApplySwap(side, swap);
                        }}
                      >
                        <span className="sr-only">Swap in </span>
                        <HeroCell heroId={swap.in} shape="circle" size="sm" />
                      </Button>
                    </SwapTooltip>
                  </TableRowHeader>
                  <TableCell className={cn(HALF_NAME_CELL, "text-muted-foreground")}>
                    <HeroCell heroId={swap.out} shape="circle" size="sm" />
                  </TableCell>
                  <TableCell className="text-end">
                    <Points value={swap.gain} align="end" className="font-semibold" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {sideSwaps.length > COLLAPSED_ROWS && (
            <PanelShowMore open={expanded} total={Math.min(sideSwaps.length, MAX_ROWS)} onOpenChange={setExpanded} />
          )}
        </>
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
          <Table density="dense" aria-label="Best next pick">
            <TableHeader>
              <TableRow>
                <TableHead tone="muted" className={RANK_CELL}>
                  #
                </TableHead>
                <TableHead tone="muted">Hero</TableHead>
                <TableHead tone="muted" className="text-end">
                  Gain
                </TableHead>
                <TableHead tone="muted" className="text-end">
                  Syn pts
                </TableHead>
                <TableHead tone="muted" className="text-end">
                  Vs pts
                </TableHead>
                <TableHead tone="muted" className="text-end">
                  Win rate
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody onKeyDown={navigation.onKeyDown}>
              {top.map((rec, index) => (
                <TableRow key={rec.heroId} data-interactive="" onClick={rowClick(() => onPick(side, rec.heroId))}>
                  <TableCell className={RANK_CELL}>{index + 1}</TableCell>
                  <TableRowHeader className={NAME_CELL}>
                    <RecommendationTooltip rec={rec}>
                      <Button
                        variant="text"
                        size="inline"
                        {...navigation.getItemProps(index)}
                        className="max-w-full justify-start"
                        onClick={(event) => {
                          event.stopPropagation();
                          onPick(side, rec.heroId);
                        }}
                      >
                        <span className="sr-only">Pick </span>
                        <HeroCell heroId={rec.heroId} shape="circle" size="sm" />
                      </Button>
                    </RecommendationTooltip>
                  </TableRowHeader>
                  {/* The column the list is ranked by. */}
                  <TableCell className="text-end">
                    <Points value={rec.gain} align="end" className="font-semibold" />
                  </TableCell>
                  <TableCell className="text-end">
                    <Points value={rec.synergy} align="end" />
                  </TableCell>
                  <TableCell className="text-end">
                    <Points value={rec.counter} align="end" />
                  </TableCell>
                  <TableCell className="text-end tabular-nums">{formatRate(rec.winRate)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
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
