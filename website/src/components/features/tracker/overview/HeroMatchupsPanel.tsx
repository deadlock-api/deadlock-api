import { useQuery } from "@tanstack/react-query";
import type { PlayerMatchHistoryEntry } from "deadlock_api_client";
import { Swords } from "lucide-react";
import { useState } from "react";

import { HeroCell } from "~/components/domain/assets/HeroCell";
import { CompanionMatchesDialog } from "~/components/features/tracker/breakdown/CompanionMatchesDialog";
import { useHeroMatchups } from "~/components/features/tracker/breakdown/useHeroMatchups";
import { SortableHeader } from "~/components/patterns/data-table/SortableHeader";
import { TableEmptyRow } from "~/components/patterns/data-table/TableEmptyRow";
import { PanelWithDetails } from "~/components/patterns/panel/PanelWithDetails";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { SkeletonRows } from "~/components/patterns/states/Skeletons";
import { Delta } from "~/components/ui/delta";
import { Field } from "~/components/ui/field";
import { Heading, useNextHeadingLevel } from "~/components/ui/heading";
import { useSort } from "~/components/ui/hooks/use-sort";
import { Segmented, SegmentedItem } from "~/components/ui/segmented";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableRowHeader } from "~/components/ui/table";
import { formatPercent } from "~/lib/format";
import { differsFromBaseline, type HeroMatchupRow, rankHeroes, rankingMinimum } from "~/lib/tracker/hero-matchups";
import { heroesQueryOptions } from "~/queries/asset-queries";

type Side = "with" | "against";

const PREVIEWS = [
  { label: "Best teammates", side: "with", order: "best" },
  { label: "Worst teammates", side: "with", order: "worst" },
  { label: "Easiest opponents", side: "against", order: "best" },
  { label: "Hardest opponents", side: "against", order: "worst" },
] as const;
const PREVIEW_ROWS = 3;
/** The smallest number of games a hero needs to be listed in the dialog. */
const MINIMUM_MATCHES = [1, 5, 10, 20] as const;

const winRate = (row: HeroMatchupRow, side: Side) => row[side].wins / row[side].matches;

/**
 * The tracked player's win rate with every other hero on their team and against every hero on the other, over the
 * filtered matches. With the hero filter set, that is the chosen hero's teammates and opponents.
 */
export function HeroMatchupsPanel({
  entries,
  onOpenMatch,
}: {
  entries: PlayerMatchHistoryEntry[];
  onOpenMatch: (matchId: number) => void;
}) {
  const { matchups, isPending, isError, isFetching, retry } = useHeroMatchups(entries);
  const [open, setOpen] = useState(false);
  const [minimum, setMinimum] = useState<number>(5);
  const openMatchFromDialog = (matchId: number) => {
    setOpen(false);
    onOpenMatch(matchId);
  };
  const baseline = matchups && matchups.matches > 0 ? matchups.wins / matchups.matches : undefined;
  const rankMinimum = rankingMinimum(matchups?.matches ?? 0);

  return (
    <PanelWithDetails
      title="Heroes with & against you"
      icon={Swords}
      open={open}
      onOpenChange={setOpen}
      description={
        matchups &&
        baseline !== undefined &&
        `${matchups.matches.toLocaleString("en-US")} games · ${formatPercent(baseline, 0)} win rate`
      }
      details={
        matchups === undefined || baseline === undefined ? (
          <LoadingState label="hero matchups" align="center" />
        ) : (
          <div className="flex flex-col gap-3">
            <Field orientation="horizontal" label="Min. games">
              <Segmented
                size="sm"
                width="hug"
                value={String(minimum)}
                onValueChange={(value) => setMinimum(Number(value))}
              >
                {MINIMUM_MATCHES.map((count) => (
                  <SegmentedItem key={count} value={String(count)}>
                    {count}+<span className="sr-only"> games</span>
                  </SegmentedItem>
                ))}
              </Segmented>
            </Field>
            <div className="grid gap-4 @4xl/stats-dialog:grid-cols-2">
              {(["with", "against"] as const).map((side) => (
                <MatchupGroup key={side} title={side === "with" ? "Teammates" : "Opponents"}>
                  <MatchupTable
                    rows={matchups.rows}
                    side={side}
                    minimum={minimum}
                    baseline={baseline}
                    entries={entries}
                    onOpenMatch={openMatchFromDialog}
                  />
                </MatchupGroup>
              ))}
            </div>
          </div>
        )
      }
    >
      {isError && matchups === undefined ? (
        <ErrorState variant="inline" title="Could not load hero matchups" onRetry={retry} retrying={isFetching} />
      ) : (
        <div className="@container/matchups">
          <div className="grid gap-3 @xl/matchups:grid-cols-2 @4xl/matchups:grid-cols-4">
            {PREVIEWS.map(({ label, side, order }) => (
              <MatchupGroup key={label} title={label}>
                {isPending || matchups === undefined ? (
                  <SkeletonRows
                    rows={PREVIEW_ROWS}
                    size="sm"
                    variant="solid"
                    label={label.toLowerCase()}
                    className="py-2"
                  />
                ) : (
                  <MatchupPreview
                    label={label}
                    side={side}
                    rows={rankHeroes(matchups.rows, side, order, rankMinimum, PREVIEW_ROWS)}
                    minimum={rankMinimum}
                    entries={entries}
                    onOpenMatch={onOpenMatch}
                  />
                )}
              </MatchupGroup>
            ))}
          </div>
        </div>
      )}
    </PanelWithDetails>
  );
}

/** One list under its title, which takes the level below the panel's or the dialog's own. */
function MatchupGroup({ title, children }: { title: string; children: React.ReactNode }) {
  const headingLevel = useNextHeadingLevel();
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <Heading as={headingLevel} size="xs">
        {title}
      </Heading>
      {children}
    </div>
  );
}

/** A hero's game count, opening the matches it was played with or against. */
function MatchupGames({
  row,
  side,
  entries,
  onOpenMatch,
  className,
}: {
  row: HeroMatchupRow;
  side: Side;
  entries: PlayerMatchHistoryEntry[];
  onOpenMatch: (matchId: number) => void;
  className?: string;
}) {
  const { data: name } = useQuery({
    ...heroesQueryOptions,
    select: (heroes) => heroes.find((hero) => hero.id === row.heroId)?.name,
  });
  return (
    <CompanionMatchesDialog
      row={row[side]}
      name={name ?? "this hero"}
      relation={side}
      entries={entries}
      onOpenMatch={onOpenMatch}
      className={className}
    />
  );
}

function MatchupPreview({
  label,
  side,
  rows,
  minimum,
  entries,
  onOpenMatch,
}: {
  label: string;
  side: Side;
  rows: HeroMatchupRow[];
  minimum: number;
  entries: PlayerMatchHistoryEntry[];
  onOpenMatch: (matchId: number) => void;
}) {
  if (rows.length === 0) {
    return <EmptyState variant="inline" size="compact" title={`No hero with ${minimum}+ games yet.`} />;
  }
  return (
    <Table density="dense" aria-label={label}>
      <TableHeader>
        <TableRow>
          <TableHead className="ps-0 text-xs">Hero</TableHead>
          <TableHead className="text-end text-xs">Games</TableHead>
          <TableHead className="pe-0 text-end text-xs">Win %</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.heroId}>
            <TableRowHeader className="w-full max-w-0 ps-0">
              <HeroCell heroId={row.heroId} size="sm" className="text-xs font-medium" />
            </TableRowHeader>
            <TableCell className="text-end tabular-nums">
              <MatchupGames row={row} side={side} entries={entries} onOpenMatch={onOpenMatch} className="text-xs" />
            </TableCell>
            <TableCell className="pe-0 text-end text-xs tabular-nums">{formatPercent(winRate(row, side), 0)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

type Sort = "matches" | "winrate";

function MatchupTable({
  rows,
  side,
  minimum,
  baseline,
  entries,
  onOpenMatch,
}: {
  rows: HeroMatchupRow[];
  side: Side;
  minimum: number;
  /** The tracked player's win rate over the same matches. */
  baseline: number;
  entries: PlayerMatchHistoryEntry[];
  onOpenMatch: (matchId: number) => void;
}) {
  const { sortKey, dir, toggle } = useSort<Sort>({ defaultValue: { key: "matches", dir: "desc" } });
  const value = (row: HeroMatchupRow) => (sortKey === "matches" ? row[side].matches : winRate(row, side));
  const visible = rows
    .filter((row) => row[side].matches >= minimum)
    .sort(
      (a, b) =>
        (dir === "desc" ? value(b) - value(a) : value(a) - value(b)) ||
        b[side].matches - a[side].matches ||
        a.heroId - b.heroId,
    );
  const label = side === "with" ? "Your win rate with each hero on your team" : "Your win rate against each hero";

  return (
    <div className="@container">
      <Table density="compact" aria-label={label}>
        <TableHeader tone="muted">
          <TableRow>
            <TableHead>Hero</TableHead>
            {(
              [
                { key: "matches", label: "Games" },
                { key: "winrate", label: "Win %" },
              ] as const
            ).map((column) => (
              <SortableHeader
                key={column.key}
                label={column.label}
                sortKey={column.key}
                activeSortKey={sortKey}
                sortDir={dir}
                align="end"
                onSortChange={toggle}
              />
            ))}
            <TableHead className="hidden text-end @xs:table-cell">vs. avg</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.map((row) => (
            <TableRow key={row.heroId}>
              <TableRowHeader className="w-full max-w-0">
                <HeroCell heroId={row.heroId} size="sm" />
              </TableRowHeader>
              <TableCell className="text-end tabular-nums">
                <MatchupGames row={row} side={side} entries={entries} onOpenMatch={onOpenMatch} />
              </TableCell>
              <TableCell className="text-end tabular-nums">{formatPercent(winRate(row, side))}</TableCell>
              <TableCell className="hidden text-end tabular-nums @xs:table-cell">
                <Delta
                  value={(winRate(row, side) - baseline) * 100}
                  format="number"
                  unit=" pp"
                  zero="visible"
                  significant={differsFromBaseline(row[side], baseline)}
                />
              </TableCell>
            </TableRow>
          ))}
          {visible.length === 0 && <TableEmptyRow colSpan={4}>No hero with {minimum}+ games</TableEmptyRow>}
        </TableBody>
      </Table>
    </div>
  );
}
