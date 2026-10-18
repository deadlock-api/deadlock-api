import { useQuery } from "@tanstack/react-query";
import { Fragment, type KeyboardEvent } from "react";

import { HeroImage } from "~/components/domain/assets/HeroImage";
import { HeroName } from "~/components/domain/assets/HeroName";
import { HeatCell } from "~/components/ui/heat-cell";
import { useGridNavigation } from "~/components/ui/hooks/use-grid-navigation";
import { NoValue } from "~/components/ui/no-value";
import { Separator } from "~/components/ui/separator";
import { TooltipTarget } from "~/components/ui/tooltip";
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
import { heroesQueryOptions } from "~/queries/asset-queries";

import { Points } from "./Points";
import { HeroTooltip, StatTooltip } from "./StatTooltip";

/** `matrix` is the full draft grid; `duel` is the four-cell lane close-up in a third-width card. */
const VARIANTS = {
  matrix: {
    // Squaring off is handled by capping the grid, not the cell: a cap here would leave the cell
    // centred in a taller row and reopen the gaps between cells.
    cell: "aspect-auto h-full w-full",
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
 * shortened it too. Each rule is one element spanning its whole track, placed explicitly, so the
 * auto-placed cells flow around it.
 */
const RULE_GAP = "0.375rem";
const MARGIN_CELL = "flex items-center justify-center self-stretch text-xs font-bold";

/** The tenth is dropped from ten points up: four characters is all a square cell fits. */
const gridDigits = (value: number | undefined) => (Math.abs(value ?? 0) >= 10 ? 0 : 1);
const gridPoints = (value: number | undefined) => formatPoints(value, gridDigits(value));

/** An unsampled matchup prints a dash: `0` would read as a measurement rather than the absence of one. */
const compactCount = (matches: number) => (matches > 0 ? compactNumber(matches) : <NoValue label="No matches" />);

/** An unsampled cell has no fill of its own, so the cell falls back to its empty look. */
const heatFill = (value: number | undefined, scale: number) =>
  value === undefined || !Number.isFinite(value) ? undefined : heatBackground(value, scale);

interface MatchupGridProps {
  /** Ally rows by enemy columns; the heroes on both axes are read back off the cells. */
  cells: MatchupCell[][];
  index: StatsIndex;
  /** Points of edge that saturate the colour ramp. */
  scale: number;
  /**
   * Adds the trailing average column and row: each row's, each column's and the whole grid's mean
   * edge. All of them read from the row side, like the cells, so one colour means one thing across
   * the grid.
   */
  margins?: boolean;
  variant: keyof typeof VARIANTS;
}

/** What a cell is named by: the cell grid is one tab stop, so each cell says which two heroes it is. */
interface CellNavigation {
  label: string;
  tabIndex: number;
  ref: (cell: HTMLButtonElement | null) => void;
  onFocus: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
}

function GridCell({
  cell,
  index,
  scale,
  showCounts,
  cellClass,
  navigation: { label, ...navigation },
}: {
  cell: MatchupCell;
  index: StatsIndex;
  scale: number;
  showCounts: boolean;
  cellClass: string;
  navigation: CellNavigation;
}) {
  // The styling lives on the trigger element itself: a `display: contents` wrapper has no box, so
  // Radix could not measure it and parked the card in the page corner.
  //
  // Text stays neutral: the fill already carries sign and magnitude, and matching its hue put the
  // strongest cells around 3.3:1.
  const className = cn(
    "flex flex-col items-center justify-center gap-0.5 text-xs font-semibold tabular-nums",
    cell.edge === undefined ? "text-muted-foreground" : "text-foreground",
    cellClass,
  );
  return (
    <StatTooltip
      trigger="toggle"
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
      <HeatCell color={heatFill(cell.edge, scale)} label={label} title="" className={className} {...navigation}>
        <span>{gridPoints(cell.edge)}</span>
        {/* A phone-width matrix has no room for a readable count under the edge; the card (a tap opens it) and the
            label keep it. */}
        {showCounts && (
          <span className="hidden text-xs leading-none font-normal text-on-heat-muted @sm:block">
            {compactCount(cell.matches)}
          </span>
        )}
      </HeatCell>
    </StatTooltip>
  );
}

/** The ally-rows by enemy-columns heat grid, shared by the counter matrix and the lane deep dive. */
export function MatchupGrid({ cells, index, scale, margins: showMargins = false, variant }: MatchupGridProps) {
  const { cell: cellClass, cap, fill, portrait, track, showCounts } = VARIANTS[variant];
  const columns = cells[0]?.map((cell) => cell.enemy) ?? [];
  const { data: names } = useQuery({
    ...heroesQueryOptions,
    select: (heroes) => new Map(heroes.map((hero) => [hero.id, hero.name])),
  });
  const nameOf = (heroId: number) => names?.get(heroId) ?? `Hero ${heroId}`;
  // One tab stop for the whole grid, the arrow keys move between its cells (WAI-ARIA grid keys).
  const grid = useGridNavigation<HTMLButtonElement>(columns.length);
  // A smaller draft can leave the last focused cell out of the grid; the first cell is the tab stop then.
  const tabStop = grid.activeIndex < cells.length * columns.length ? grid.activeIndex : 0;
  const cellNavigation = (cell: MatchupCell, cellIndex: number): CellNavigation => ({
    label: `${nameOf(cell.hero)} vs. ${nameOf(cell.enemy)}: edge ${gridPoints(cell.edge)}, ${formatCount(cell.matches)} matches`,
    tabIndex: tabStop === cellIndex ? 0 : -1,
    ref: grid.register(cellIndex),
    onFocus: () => grid.setActiveIndex(cellIndex),
    onKeyDown: (event) => grid.onKeyDown(event, cellIndex),
  });
  const margins = showMargins && {
    columns: columns.map((_, column) => mean(cells.map((row) => row[column].edge))),
    rows: cells.map((row) => mean(row.map((cell) => cell.edge))),
    corner: mean(cells.flat().map((cell) => cell.edge)),
  };
  const template = `${track.head} repeat(${columns.length}, minmax(0, 1fr))${margins ? ` ${RULE_GAP} ${track.avg}` : ""}`;
  const rowTemplate = fill
    ? `auto repeat(${cells.length}, minmax(0, 1fr))${margins ? ` ${RULE_GAP} auto` : ""}`
    : undefined;
  const ruleColumn = columns.length + 2;
  const ruleRow = cells.length + 2;
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
            <HeroImage heroId={enemy} shape="circle" className={cn("shrink-0", portrait)} />
          </HeroTooltip>
        </div>
      ))}
      {margins && (
        <div className="flex items-center justify-center self-stretch pb-1.5 text-xs text-muted-foreground">Avg</div>
      )}

      {cells.map((row, rowIndex) => (
        <Fragment key={row[0].hero}>
          <div className="flex justify-center pe-1.5">
            <HeroTooltip heroId={row[0].hero} index={index}>
              <HeroImage heroId={row[0].hero} shape="circle" className={cn("shrink-0", portrait)} />
            </HeroTooltip>
          </div>
          {row.map((cell, columnIndex) => (
            <GridCell
              key={cell.enemy}
              navigation={cellNavigation(cell, rowIndex * columns.length + columnIndex)}
              cell={cell}
              index={index}
              scale={scale}
              showCounts={showCounts}
              cellClass={cellClass}
            />
          ))}
          {margins && (
            <StatTooltip
              trigger="toggle"
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
              <TooltipTarget display="block" className={MARGIN_CELL}>
                <Points
                  value={margins.rows[rowIndex]}
                  digits={gridDigits(margins.rows[rowIndex])}
                  className="font-bold"
                />
              </TooltipTarget>
            </StatTooltip>
          )}
        </Fragment>
      ))}

      {margins && (
        <>
          <div className="flex items-center justify-center self-stretch pt-1.5 text-xs text-muted-foreground">Avg</div>
          {margins.columns.map((value, columnIndex) => (
            <StatTooltip
              trigger="toggle"
              key={columns[columnIndex]}
              title={
                <span className="flex gap-1">
                  Average edge vs. <HeroName heroId={columns[columnIndex]} />
                </span>
              }
              rows={[
                { label: "Edge", value: formatPoints(value), className: deltaClass(value) },
                { label: "Matchups", value: String(cells.length) },
              ]}
            >
              <TooltipTarget display="block" className={cn("pt-1.5", MARGIN_CELL)}>
                <Points value={value} digits={gridDigits(value)} className="font-bold" />
              </TooltipTarget>
            </StatTooltip>
          ))}
          <StatTooltip
            trigger="toggle"
            title="Whole matchup"
            rows={[
              { label: "Edge", value: formatPoints(margins.corner), className: deltaClass(margins.corner) },
              { label: "Matchups", value: String(cells.length * columns.length) },
            ]}
          >
            <TooltipTarget display="block" className={cn("pt-1.5", MARGIN_CELL)}>
              <Points value={margins.corner} digits={gridDigits(margins.corner)} className="font-bold" />
            </TooltipTarget>
          </StatTooltip>

          <div
            className="flex justify-end self-stretch"
            style={{ gridColumn: ruleColumn, gridRow: `1 / span ${cells.length + 3}` }}
          >
            <Separator orientation="vertical" />
          </div>
          <div
            className="flex items-end"
            style={{ gridRow: ruleRow, gridColumn: `1 / span ${columns.length + 3}`, height: RULE_GAP }}
          >
            <Separator />
          </div>
        </>
      )}
    </div>
  );
}
