import { Fragment } from "react";

import { HeroName } from "~/components/HeroName";
import { type MatchupCell, mean, type StatsIndex } from "~/lib/team-builder/analysis";
import {
  compactNumber,
  deltaClass,
  formatCount,
  formatPoints,
  formatRate,
  heatBackground,
} from "~/lib/team-builder/format";
import { cn } from "~/lib/utils";

import { DeltaValue } from "./DeltaBar";
import { HeroPortrait } from "./HeroPortrait";
import { HeroTooltip, StatTooltip } from "./StatTooltip";

/** `matrix` is the full draft grid; `duel` is the four-cell lane close-up in a third-width card. */
const VARIANTS = {
  matrix: {
    // Squaring off is handled by capping the grid, not the cell: a cap here would leave the cell
    // centred in a taller row and reopen the gaps between cells.
    cell: "h-full w-full",
    fill: true,
    portrait: "size-8",
    /** Widths of the leading portrait column and the trailing average column. */
    track: { head: "2.75rem", avg: "2.5rem" },
    /** Height in rem of the header and average rows, which the square cap has to leave room for. */
    cap: 4.25,
    showCounts: true,
  },
  duel: {
    cell: "aspect-square w-full",
    fill: false,
    cap: undefined,
    portrait: "size-6",
    track: { head: "2.25rem", avg: "1.75rem" },
    showCounts: false,
  },
} as const;

/**
 * Rules separating the margins from the body. The clearance is a real grid track rather than a
 * margin on the cells: the duel cells are `aspect-square`, so narrowing the last column would have
 * shortened it too. Every cell along a rule has to carry it, or the line breaks where it crosses.
 */
const RULE_GAP = "0.375rem";
const RULE_BOX = "flex items-center justify-center self-stretch";
const COLUMN_RULE = `${RULE_BOX} border-l border-white/25`;
const ROW_RULE = `${RULE_BOX} border-t border-white/25`;

/** The tenth is dropped from ten points up: four characters is all a square cell fits. */
const gridPoints = (value: number | undefined) => formatPoints(value, Math.abs(value ?? 0) >= 10 ? 0 : 1);

/** An unsampled matchup prints a dash: `0` would read as a measurement rather than the absence of one. */
const compactCount = (matches: number) => (matches > 0 ? compactNumber(matches) : "—");

interface MatchupGridProps {
  /** Ally rows by enemy columns; the heroes on both axes are read back off the cells. */
  cells: MatchupCell[][];
  index: StatsIndex;
  /** Points of edge that saturate the colour ramp. */
  scale: number;
  /**
   * Per-column averages, which turn on the trailing average row and column as a whole; the row
   * averages and the corner are derived from the cells.
   *
   * Stated from the *column* hero's own side — the opposite direction to the cells and to the row
   * averages — so green here means that column's hero is winning, while green in a cell means the
   * ally row is.
   */
  columnMargins?: (number | undefined)[];
  variant: keyof typeof VARIANTS;
}

function GridCell({
  cell,
  index,
  scale,
  showCounts,
  cellClass,
}: {
  cell: MatchupCell;
  index: StatsIndex;
  scale: number;
  showCounts: boolean;
  cellClass: string;
}) {
  // The styling lives on the trigger element itself: a `display: contents` wrapper has no box, so
  // Radix could not measure it and parked the card in the page corner.
  //
  // Text stays neutral: the fill already carries sign and magnitude, and matching its hue put the
  // strongest cells around 3.3:1.
  const className = cn(
    "flex cursor-default flex-col items-center justify-center gap-0.5 text-[11px] font-semibold tabular-nums",
    cell.edge === undefined ? "text-muted-foreground" : "text-foreground",
    cellClass,
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
      <div className={className} style={{ background: heatBackground(cell.edge, scale) }}>
        <span>{gridPoints(cell.edge)}</span>
        {showCounts && (
          <span className="text-[9px] leading-none font-normal text-muted-foreground">
            {compactCount(cell.matches)}
          </span>
        )}
      </div>
    </StatTooltip>
  );
}

/** The ally-rows by enemy-columns heat grid, shared by the counter matrix and the lane deep dive. */
export function MatchupGrid({ cells, index, scale, columnMargins, variant }: MatchupGridProps) {
  const { cell: cellClass, cap, fill, portrait, track, showCounts } = VARIANTS[variant];
  const columns = cells[0]?.map((cell) => cell.enemy) ?? [];
  const margins = columnMargins && {
    columns: columnMargins,
    rows: cells.map((row) => mean(row.map((cell) => cell.edge))),
    corner: mean(cells.flat().map((cell) => cell.edge)),
  };
  const template = `${track.head} repeat(${columns.length}, minmax(0, 1fr))${margins ? ` ${RULE_GAP} ${track.avg}` : ""}`;
  const rowTemplate = fill
    ? `auto repeat(${cells.length}, minmax(0, 1fr))${margins ? ` ${RULE_GAP} auto` : ""}`
    : undefined;
  /**
   * Stops a row growing past its own column width. `cqw` is the only place the column width can be
   * derived from, so the caller has to establish a `@container` for it to measure.
   */
  const maxHeight =
    cap && margins && columns.length > 0
      ? `calc(${cells.length} * (100cqw - ${track.head} - ${RULE_GAP} - ${track.avg}) / ${columns.length} + ${cap}rem)`
      : undefined;

  return (
    <div
      className={cn("grid items-center", fill && "h-full")}
      style={{ gridTemplateColumns: template, gridTemplateRows: rowTemplate, maxHeight }}
    >
      <div />
      {columns.map((enemy) => (
        <div key={enemy} className="flex justify-center pb-1.5">
          <HeroTooltip heroId={enemy} index={index}>
            <HeroPortrait heroId={enemy} size={portrait} />
          </HeroTooltip>
        </div>
      ))}
      {margins && (
        <>
          <div />
          <div className={cn("pb-1.5 text-[11px] text-muted-foreground", COLUMN_RULE)}>Avg</div>
        </>
      )}

      {cells.map((row, rowIndex) => (
        <Fragment key={row[0].hero}>
          <div className="flex justify-center pr-1.5">
            <HeroTooltip heroId={row[0].hero} index={index}>
              <HeroPortrait heroId={row[0].hero} size={portrait} />
            </HeroTooltip>
          </div>
          {row.map((cell) => (
            <GridCell
              key={cell.enemy}
              cell={cell}
              index={index}
              scale={scale}
              showCounts={showCounts}
              cellClass={cellClass}
            />
          ))}
          {margins && (
            <>
              <div />
              <StatTooltip
                title="Average edge"
                rows={[
                  {
                    label: "Edge",
                    value: formatPoints(margins.rows[rowIndex]),
                    className: deltaClass(margins.rows[rowIndex]),
                  },
                  { label: "Matchups", value: String(row.length) },
                ]}
              >
                <DeltaValue
                  value={margins.rows[rowIndex]}
                  format={gridPoints}
                  className={cn("cursor-default text-xs font-bold", COLUMN_RULE)}
                />
              </StatTooltip>
            </>
          )}
        </Fragment>
      ))}

      {margins && (
        <>
          {/* The spacer row. Its cell in the average column still draws the vertical rule, so the
              line runs unbroken into the corner. */}
          <div style={{ height: RULE_GAP }} />
          {columns.map((enemy) => (
            <div key={`vgap-${enemy}`} />
          ))}
          <div />
          <div className={COLUMN_RULE} />

          <div className={cn("pt-1.5 text-[11px] text-muted-foreground", ROW_RULE)}>Avg</div>
          {margins.columns.map((value, columnIndex) => (
            <StatTooltip
              key={columns[columnIndex]}
              title={<HeroName heroId={columns[columnIndex]} />}
              rows={[
                { label: "Own edge in this lane", value: formatPoints(value) },
                { label: "Measured from", value: "their side" },
                { label: "Matchups", value: String(cells.length) },
              ]}
            >
              <DeltaValue
                value={value}
                format={gridPoints}
                className={cn("cursor-default pt-1.5 text-xs font-bold", ROW_RULE)}
              />
            </StatTooltip>
          ))}
          <div className={ROW_RULE} />
          <StatTooltip
            title="Whole matchup"
            rows={[
              { label: "Edge", value: formatPoints(margins.corner), className: deltaClass(margins.corner) },
              { label: "Matchups", value: String(cells.length * columns.length) },
            ]}
          >
            <DeltaValue
              value={margins.corner}
              format={gridPoints}
              className={cn("cursor-default pt-1.5 text-xs font-bold", COLUMN_RULE, ROW_RULE)}
            />
          </StatTooltip>
        </>
      )}
    </div>
  );
}
