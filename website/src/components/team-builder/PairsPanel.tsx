import { ChartNoAxesGanttIcon, ListIcon } from "lucide-react";
import { useState } from "react";

import { HeroName } from "~/components/HeroName";
import type { PairRow, StatsIndex } from "~/lib/team-builder/analysis";
import { formatCount, formatRate } from "~/lib/team-builder/format";
import { cn } from "~/lib/utils";

import { DeltaValue } from "./DeltaBar";
import { HeroPortrait } from "./HeroPortrait";
import { PairsChart } from "./PairsChart";
import { PairTooltip } from "./PairTooltip";
import { Panel, PanelHeader, PanelMessage, PanelShowMore, PanelSkeleton, PanelViewToggle } from "./Panel";

/** How many of the 15 pairings show before the list has to be expanded. */
const COLLAPSED_ROWS = 8;

/** Header and rows share this template so the columns line up regardless of hero name length. */
const COLUMNS = "grid grid-cols-[auto_minmax(0,1fr)_3.5rem_4rem_4rem] items-center gap-x-2.5 px-4";

interface PairsPanelProps {
  pairs: PairRow[];
  index: StatsIndex;
  loading: boolean;
  onOpen: (pair: PairRow) => void;
}

export function PairsPanel({ pairs, index, loading, onOpen }: PairsPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [view, setView] = useState<"list" | "chart">("list");
  const visible = expanded ? pairs : pairs.slice(0, COLLAPSED_ROWS);
  return (
    <Panel>
      <PanelHeader title="Pairs in your team" note={loading ? undefined : `${pairs.length} combos`}>
        <PanelViewToggle
          value={view}
          onChange={setView}
          options={[
            { value: "list", label: "Ranked list", icon: ListIcon },
            { value: "chart", label: "Synergy chart", icon: ChartNoAxesGanttIcon },
          ]}
        />
      </PanelHeader>
      {loading ? (
        <PanelSkeleton rows={6} />
      ) : pairs.length === 0 ? (
        <PanelMessage>Pick at least two heroes on your side to compare pairings.</PanelMessage>
      ) : view === "chart" ? (
        <PairsChart pairs={pairs} index={index} onOpen={onOpen} />
      ) : (
        <>
          <div
            className={cn(
              COLUMNS,
              "border-b border-border py-2 text-[11px] tracking-[0.05em] text-muted-foreground uppercase",
            )}
          >
            <span className="w-12">Pair</span>
            <span />
            <span className="text-right">Δ</span>
            <span className="text-right">Win rate</span>
            <span className="text-right">Matches</span>
          </div>
          <div>
            {visible.map((pair) => (
              <PairTooltip key={`${pair.a}-${pair.b}`} pair={pair} index={index}>
                <button
                  type="button"
                  onClick={() => onOpen(pair)}
                  className={cn(
                    COLUMNS,
                    "h-11 w-full cursor-pointer border-b border-border/60 text-left hover:bg-white/[0.03]",
                  )}
                >
                  <span className="flex w-14 gap-0.5">
                    <HeroPortrait heroId={pair.a} />
                    <HeroPortrait heroId={pair.b} />
                  </span>
                  <span className="flex min-w-0 flex-col text-[12.5px] leading-tight">
                    <HeroName heroId={pair.a} />
                    <HeroName heroId={pair.b} />
                  </span>
                  <DeltaValue value={pair.delta} className="text-right text-[13px] font-bold" />
                  <span className="text-right text-xs tabular-nums">{formatRate(pair.winRate)}</span>
                  <span className="text-right text-[11px] text-muted-foreground tabular-nums">
                    {formatCount(pair.matches)}
                  </span>
                </button>
              </PairTooltip>
            ))}
          </div>
          {pairs.length > COLLAPSED_ROWS && (
            <PanelShowMore expanded={expanded} total={pairs.length} onToggle={() => setExpanded((open) => !open)} />
          )}
        </>
      )}
    </Panel>
  );
}
