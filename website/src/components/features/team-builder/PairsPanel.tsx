import { ChartNoAxesGanttIcon, ListIcon } from "lucide-react";
import { useState } from "react";

import { HeroImage } from "~/components/domain/assets/HeroImage";
import { HeroName } from "~/components/domain/assets/HeroName";
import { Panel, PanelBody, PanelHeader, PanelShowMore } from "~/components/patterns/panel/Panel";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { SkeletonRows } from "~/components/patterns/states/Skeletons";
import { Button } from "~/components/ui/button";
import { useListNavigation } from "~/components/ui/hooks/use-list-navigation";
import { Segmented, SegmentedItem } from "~/components/ui/segmented";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableRowHeader } from "~/components/ui/table";
import type { PairRow, Side, StatsIndex } from "~/lib/team-builder/analysis";
import { formatCount, formatRate } from "~/lib/team-builder/format";

import { PairsChart } from "./PairsChart";
import { PairTooltip } from "./PairTooltip";
import { Points } from "./Points";
import { SideToggle } from "./SideToggle";

/** How many of the 15 pairings show before the list has to be expanded. */
const COLLAPSED_ROWS = 8;

interface PairsPanelProps {
  allyPairs: PairRow[];
  enemyPairs: PairRow[];
  index: StatsIndex;
  loading: boolean;
  onOpen: (pair: PairRow) => void;
}

export function PairsPanel({ allyPairs, enemyPairs, index, loading, onOpen }: PairsPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [view, setView] = useState<"list" | "chart">("list");
  const [side, setSide] = useState<Side>("ally");
  const pairs = side === "ally" ? allyPairs : enemyPairs;
  const visible = expanded ? pairs : pairs.slice(0, COLLAPSED_ROWS);
  const [cursor, setCursor] = useState(0);
  const navigation = useListNavigation({ count: visible.length, value: cursor, onValueChange: setCursor });
  return (
    <Panel className="@container/pairs">
      <PanelHeader title="Pairs">
        <SideToggle value={side} onValueChange={setSide} />
        <Segmented size="sm" width="hug" aria-label="View" value={view} onValueChange={setView}>
          <SegmentedItem value="list" aria-label="Ranked list" title="Ranked list">
            <ListIcon />
          </SegmentedItem>
          <SegmentedItem value="chart" aria-label="Synergy chart" title="Synergy chart">
            <ChartNoAxesGanttIcon />
          </SegmentedItem>
        </Segmented>
      </PanelHeader>
      {loading ? (
        <PanelBody>
          <SkeletonRows rows={6} />
        </PanelBody>
      ) : pairs.length === 0 ? (
        <EmptyState
          variant="inline"
          className="px-4 py-6"
          title={`Pick at least two heroes on ${side === "ally" ? "your side" : "their side"} to compare pairings.`}
        />
      ) : view === "chart" ? (
        <PairsChart pairs={pairs} index={index} onOpen={onOpen} />
      ) : (
        <>
          <Table density="dense" aria-label="Pairs">
            <TableHeader>
              <TableRow>
                <TableHead tone="muted">Pair</TableHead>
                <TableHead tone="muted" className="text-end">
                  Syn pts
                </TableHead>
                <TableHead tone="muted" className="text-end">
                  Win rate
                </TableHead>
                <TableHead tone="muted" className="text-end">
                  Games
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody onKeyDown={navigation.onKeyDown}>
              {visible.map((pair, row) => (
                <TableRow
                  key={`${pair.a}-${pair.b}`}
                  data-interactive=""
                  onClick={(event) => {
                    onOpen(pair);
                    event.currentTarget.querySelector<HTMLElement>("[data-list-index]")?.focus({ preventScroll: true });
                  }}
                >
                  <TableRowHeader className="w-full max-w-0">
                    <PairTooltip pair={pair} index={index}>
                      <Button
                        variant="text"
                        size="inline"
                        {...navigation.getItemProps(row)}
                        className="max-w-full justify-start gap-1.5"
                        onClick={(event) => {
                          event.stopPropagation();
                          onOpen(pair);
                        }}
                      >
                        {/* A narrow panel gives the portraits' width to the two names. */}
                        <span className="hidden shrink-0 gap-0.5 @sm/pairs:flex">
                          <HeroImage heroId={pair.a} shape="circle" decorative className="size-7" />
                          <HeroImage heroId={pair.b} shape="circle" decorative className="size-7" />
                        </span>
                        <span className="flex min-w-0 flex-col text-start leading-tight">
                          <HeroName heroId={pair.a} />
                          <span className="sr-only"> and </span>
                          <HeroName heroId={pair.b} />
                        </span>
                      </Button>
                    </PairTooltip>
                  </TableRowHeader>
                  <TableCell className="text-end">
                    <Points value={pair.delta} align="end" className="text-sm font-bold" />
                  </TableCell>
                  <TableCell className="text-end tabular-nums">{formatRate(pair.winRate)}</TableCell>
                  <TableCell className="text-end text-muted-foreground tabular-nums">
                    {formatCount(pair.matches)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {pairs.length > COLLAPSED_ROWS && (
            <PanelShowMore open={expanded} total={pairs.length} onOpenChange={setExpanded} />
          )}
        </>
      )}
    </Panel>
  );
}
