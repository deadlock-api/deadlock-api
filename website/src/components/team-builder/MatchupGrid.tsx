import { Fragment } from "react";

import { HeroName } from "~/components/HeroName";
import type { MatchupCell, StatsIndex } from "~/lib/team-builder/analysis";
import {
  BAD_RGB,
  deltaClass,
  formatCount,
  formatPoints,
  formatRate,
  GOOD_RGB,
  heatBackground,
  HEAT_BASE,
} from "~/lib/team-builder/format";
import { cn } from "~/lib/utils";

import { DeltaValue } from "./DeltaBar";
import { HeroPortrait } from "./HeroPortrait";
import { HeroTooltip, StatTooltip } from "./StatTooltip";

/**
 * `matrix` is the full draft grid, which stretches to fill the panel it shares with the prediction.
 * `duel` is the four-cell lane close-up, which is small enough to print each sample underneath.
 */
const VARIANTS = {
  matrix: { cellHeight: "h-full min-h-9", showCounts: false, fill: true },
  duel: { cellHeight: "h-14", showCounts: true, fill: false },
} as const;

interface MatchupGridProps {
  /** Ally rows by enemy columns; the heroes on both axes are read back off the cells. */
  cells: MatchupCell[][];
  index: StatsIndex;
  /** Points of edge that saturate the colour ramp. */
  scale: number;
  /** Optional trailing column, one value per row. */
  averages?: (number | undefined)[];
  variant: keyof typeof VARIANTS;
  onSelect?: (cell: MatchupCell) => void;
}

function GridCell({
  cell,
  index,
  scale,
  showCounts,
  cellHeight,
  onSelect,
}: {
  cell: MatchupCell;
  index: StatsIndex;
  scale: number;
  showCounts: boolean;
  cellHeight: string;
  onSelect?: (cell: MatchupCell) => void;
}) {
  // The styling lives on the trigger element itself: a `display: contents` wrapper has no box, so
  // Radix could not measure it and parked the card in the page corner.
  const className = cn(
    "flex flex-col items-center justify-center gap-0.5 rounded-md text-[11px] font-semibold tabular-nums",
    onSelect ? "cursor-pointer transition-transform hover:scale-105" : "cursor-default",
    deltaClass(cell.edge),
    cellHeight,
  );
  const style = { background: heatBackground(cell.edge, scale) };
  const body = (
    <>
      <span className={showCounts ? "text-sm font-bold" : undefined}>{formatPoints(cell.edge)}</span>
      {showCounts && (
        <span className="text-[10px] font-normal text-muted-foreground">
          {cell.matches > 0 ? `${formatCount(cell.matches)} games` : "no data"}
        </span>
      )}
    </>
  );

  return (
    <StatTooltip
      // A name element rather than a string: the card renders on hover, so a full grid of cells
      // does not each hold a hero-asset subscription just to label a tooltip nobody opened.
      title={
        <span className="flex gap-1">
          <HeroName heroId={cell.hero} /> vs. <HeroName heroId={cell.enemy} />
        </span>
      }
      rows={[
        { label: "Win rate in this matchup", value: formatRate(cell.winRate) },
        { label: "Own baseline", value: formatRate(index.heroWinRate(cell.hero)) },
        { label: "Edge", value: formatPoints(cell.edge), className: deltaClass(cell.edge) },
        { label: "Matches", value: formatCount(cell.matches) },
      ]}
    >
      {onSelect ? (
        <button type="button" onClick={() => onSelect(cell)} className={className} style={style}>
          {body}
        </button>
      ) : (
        <div className={className} style={style}>
          {body}
        </div>
      )}
    </StatTooltip>
  );
}

/** The ally-rows by enemy-columns heat grid, shared by the counter matrix and the lane deep dive. */
export function MatchupGrid({ cells, index, scale, averages, variant, onSelect }: MatchupGridProps) {
  const { cellHeight, showCounts, fill } = VARIANTS[variant];
  const columns = cells[0]?.map((cell) => cell.enemy) ?? [];
  const template = `2rem repeat(${columns.length}, minmax(0, 1fr))${averages ? " 2.5rem" : ""}`;
  const rowTemplate = fill ? `auto repeat(${cells.length}, minmax(0, 1fr))` : undefined;

  return (
    <div
      className={cn("grid items-center gap-1", fill && "h-full")}
      style={{ gridTemplateColumns: template, gridTemplateRows: rowTemplate }}
    >
      <div />
      {columns.map((enemy) => (
        <div key={enemy} className="flex justify-center pb-1">
          <HeroTooltip heroId={enemy} index={index}>
            <HeroPortrait heroId={enemy} size="size-8" />
          </HeroTooltip>
        </div>
      ))}
      {averages && <div className="pb-1 text-center text-[11px] text-muted-foreground">Avg</div>}

      {cells.map((row, rowIndex) => (
        <Fragment key={row[0].hero}>
          <HeroTooltip heroId={row[0].hero} index={index}>
            <HeroPortrait heroId={row[0].hero} size="size-8" />
          </HeroTooltip>
          {row.map((cell) => (
            <GridCell
              key={cell.enemy}
              cell={cell}
              index={index}
              scale={scale}
              showCounts={showCounts}
              cellHeight={cellHeight}
              onSelect={onSelect}
            />
          ))}
          {averages && (
            <StatTooltip
              title="Average edge"
              rows={[
                { label: "Edge", value: formatPoints(averages[rowIndex]), className: deltaClass(averages[rowIndex]) },
                { label: "Matchups", value: String(row.length) },
              ]}
            >
              <DeltaValue value={averages[rowIndex]} className="block cursor-default text-center text-xs font-bold" />
            </StatTooltip>
          )}
        </Fragment>
      ))}
    </div>
  );
}

/** The legend that explains the grid's colour ramp. */
export function MatchupLegend({ scale }: { scale: number }) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2.5 border-t border-border pt-3.5 text-[11px] text-muted-foreground">
      <span>−{scale}</span>
      <div
        className="h-1.5 min-w-20 flex-1 rounded-full"
        style={{ background: `linear-gradient(90deg, rgb(${BAD_RGB}), ${HEAT_BASE}, rgb(${GOOD_RGB}))` }}
      />
      <span>+{scale}</span>
      <span className="inline-flex items-center gap-1">
        <span className="size-2.5 rounded-[2px]" style={{ background: heatBackground(undefined, scale) }} />
        no data
      </span>
    </div>
  );
}
