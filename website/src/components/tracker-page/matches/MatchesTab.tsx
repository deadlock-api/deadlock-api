import { useQuery } from "@tanstack/react-query";
import type { PlayerMatchHistoryEntry, Rank } from "deadlock_api_client";
import { ArrowDown, ArrowUp, ChevronUp } from "lucide-react";
import { parseAsInteger, parseAsStringLiteral, useQueryState, useQueryStates } from "nuqs";
import { type ComponentProps, Fragment, type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";

import { PaginationControls } from "~/components/PaginationControls";
import { Button } from "~/components/ui/button";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { day } from "~/dayjs";
import {
  computeRecords,
  computeSessions,
  formatMatchDuration,
  formatPlaytime,
  isWin,
  MATCH_SORT_KEYS,
  type MatchSortKey,
  type PlaySession,
  recordsByMatchId,
  SORT_DIRS,
  type SortDir,
  sortMatches,
  summarize,
  summarizeByHero,
  type TrackerSummary,
} from "~/lib/tracker/compute";
import { cn } from "~/lib/utils";
import { heroesQueryOptions } from "~/queries/asset-queries";

import { LOSS_TEXT_CLASS, WIN_TEXT_CLASS } from "../shared/colors";
import { RankDelta } from "../shared/RankDelta";
import { MatchRow, ResultEdge } from "./MatchRow";
import { MatchRowDetails } from "./MatchRowDetails";

const COLUMN_COUNT = 13;
// A best among a handful of matches says little, so small sets get no record markers.
const MIN_MATCHES_FOR_RECORDS = 10;

function sessionDateLabel(unix: number): string {
  const date = day.unix(unix);
  const today = day().startOf("day");
  if (date.isSame(today, "day")) return "Today";
  if (date.isSame(today.subtract(1, "day"), "day")) return "Yesterday";
  return date.format(date.isSame(today, "year") ? "ddd, MMM D" : "ddd, MMM D, YYYY");
}

function SortableHead({
  sortKey,
  activeKey,
  dir,
  onSort,
  children,
  ...props
}: {
  sortKey: MatchSortKey;
  activeKey: MatchSortKey;
  dir: SortDir;
  onSort: (key: MatchSortKey) => void;
} & Omit<ComponentProps<"th">, "onClick">) {
  const active = activeKey === sortKey;
  return (
    <TableHead aria-sort={active ? (dir === "desc" ? "descending" : "ascending") : undefined} {...props}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="inline-flex cursor-pointer items-center gap-1 transition-colors hover:text-foreground"
      >
        {children}
        {active && (dir === "desc" ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />)}
      </button>
    </TableHead>
  );
}

function SessionRow({ session }: { session: PlaySession }) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={COLUMN_COUNT} className="bg-muted/40 py-1.5 text-xs">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
          <span className="font-semibold">{sessionDateLabel(session.startUnix)}</span>
          <span className="text-muted-foreground tabular-nums">
            {day.unix(session.startUnix).format("HH:mm")} – {day.unix(session.endUnix).format("HH:mm")}
          </span>
          <span className="tabular-nums">
            <span className={cn("font-semibold", WIN_TEXT_CLASS)}>{session.wins}W</span>
            <span className="text-muted-foreground"> – </span>
            <span className={cn("font-semibold", LOSS_TEXT_CLASS)}>{session.losses}L</span>
          </span>
          <RankDelta value={session.rankDelta} className="font-semibold" title="Net rank change over the session" />
          <span className="ml-auto text-muted-foreground tabular-nums">
            {session.matches} {session.matches === 1 ? "match" : "matches"} · {formatPlaytime(session.totalTimeS)}
          </span>
        </div>
      </TableCell>
    </TableRow>
  );
}

const round = (value: number) => Math.round(value).toLocaleString("en-US");

/**
 * Averages over the filtered history, laid out under the matching table columns. On narrow layouts
 * the label and the K/D/A precision drop to the row content's width, since the footer would
 * otherwise widen the table past its container.
 */
function AverageRow({ summary }: { summary: TrackerSummary }) {
  return (
    <TableRow
      className="text-muted-foreground hover:bg-transparent"
      title={`Average over ${summary.matches.toLocaleString("en-US")} matches`}
    >
      <TableCell title="Win rate" className="tabular-nums">
        {Math.round(summary.winrate * 100)}%
      </TableCell>
      <TableCell>
        <span className="@xl:hidden">Avg</span>
        <span className="hidden @xl:inline">Average</span>
      </TableCell>
      <TableCell className="hidden @3xl:table-cell" />
      <TableCell className="text-right tabular-nums">
        <span className="@md:hidden">
          {round(summary.avgKills)} / {round(summary.avgDeaths)} / {round(summary.avgAssists)}
        </span>
        <span className="hidden @md:inline">
          {summary.avgKills.toFixed(1)} / {summary.avgDeaths.toFixed(1)} / {summary.avgAssists.toFixed(1)}
        </span>
      </TableCell>
      <TableCell className="hidden text-right tabular-nums @md:table-cell">{round(summary.avgSouls)}</TableCell>
      <TableCell className="hidden text-right tabular-nums @2xl:table-cell">{round(summary.soulsPerMin)}</TableCell>
      <TableCell className="hidden text-right tabular-nums @5xl:table-cell">
        {round(summary.avgLastHits)} / {round(summary.avgDenies)}
      </TableCell>
      <TableCell className="hidden text-right tabular-nums @3xl:table-cell">
        {formatMatchDuration(summary.avgDurationS)}
      </TableCell>
      <TableCell className="text-right" title="Net rank change">
        <RankDelta value={summary.rankDelta} className="hidden text-xs @sm:inline" />
      </TableCell>
      <TableCell colSpan={COLUMN_COUNT - 9} />
    </TableRow>
  );
}

export function MatchesTab({
  entries,
  ranks,
  accountId,
  heroId,
  onHeroChange,
}: {
  entries: PlayerMatchHistoryEntry[];
  ranks: Rank[];
  accountId: number;
  /** The active hero filter, which the rows can toggle. */
  heroId: number | null;
  onHeroChange: (heroId: number | null) => void;
}) {
  const [expandedMatchId, setExpandedMatchId] = useQueryState("match", parseAsInteger);
  const [{ sort: sortKey, dir: sortDir }, setSort] = useQueryStates({
    sort: parseAsStringLiteral(MATCH_SORT_KEYS).withDefault("played"),
    dir: parseAsStringLiteral(SORT_DIRS).withDefault("desc"),
  });
  const sortedEntries = useMemo(() => sortMatches(entries, sortKey, sortDir), [entries, sortKey, sortDir]);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  // A shared link opens on the page holding its match.
  const [currentPage, setCurrentPage] = useState(() => {
    const index = sortedEntries.findIndex((entry) => entry.match_id === expandedMatchId);
    return index === -1 ? 0 : Math.floor(index / itemsPerPage);
  });

  const linkedRowRef = useRef<HTMLTableRowElement>(null);
  useEffect(() => {
    linkedRowRef.current?.scrollIntoView({ block: "center" });
  }, []);
  const tableTopRef = useRef<HTMLDivElement>(null);
  // Turning the page from below the table would otherwise leave the reader at the end of the new page.
  const turnPageFromBelow = (nextPage: number) => {
    setCurrentPage(nextPage);
    tableTopRef.current?.scrollIntoView({ block: "start" });
  };

  const handleSort = (key: MatchSortKey) => {
    setSort(sortKey === key ? { dir: sortDir === "desc" ? "asc" : "desc" } : { sort: key, dir: "desc" });
    setCurrentPage(0);
  };
  const sortProps = { activeKey: sortKey, dir: sortDir, onSort: handleSort };
  const toggleHeroFilter = (rowHeroId: number) => {
    onHeroChange(heroId == null ? rowHeroId : null);
    setCurrentPage(0);
  };

  const collapseExpanded = () => {
    setExpandedMatchId(null);
    // Brings the row back into view and keeps keyboard focus on it.
    linkedRowRef.current?.focus();
  };

  // Arrow keys step between the focusable match rows, skipping session and details rows. Escape
  // collapses the expanded match from its row or from anywhere inside its details.
  const handleRowKeyDown = (event: KeyboardEvent<HTMLTableSectionElement>) => {
    if (event.key === "Escape") {
      const expandedRow = linkedRowRef.current;
      const target = event.target as Node;
      if (expandedRow?.contains(target) || expandedRow?.nextElementSibling?.contains(target)) collapseExpanded();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const rows = [...event.currentTarget.querySelectorAll<HTMLTableRowElement>("tr[tabindex]")];
    const index = rows.indexOf(event.target as HTMLTableRowElement);
    if (index === -1) return;
    const next = rows[index + (event.key === "ArrowDown" ? 1 : -1)];
    if (!next) return;
    event.preventDefault();
    next.focus();
  };

  const { data: heroNames } = useQuery({
    ...heroesQueryOptions,
    select: (heroes) => new Map(heroes.map((hero) => [hero.id, hero.name])),
  });

  // Sessions are contiguous only in play order, so they are hidden under any other sort.
  const sessions = useMemo(
    () => (sortKey === "played" ? computeSessions(entries) : new Map<number, PlaySession>()),
    [entries, sortKey],
  );
  const heroSummaries = useMemo(() => summarizeByHero(entries), [entries]);
  const summary = useMemo(() => summarize(entries), [entries]);
  const heldRecords = useMemo(
    () => (entries.length >= MIN_MATCHES_FOR_RECORDS ? recordsByMatchId(computeRecords(entries)) : null),
    [entries],
  );
  const totalPages = Math.max(1, Math.ceil(entries.length / itemsPerPage));
  // Filters and the page size can shrink the list under a page that no longer exists.
  const page = Math.min(currentPage, totalPages - 1);
  const paginatedEntries = useMemo(
    () => sortedEntries.slice(page * itemsPerPage, (page + 1) * itemsPerPage),
    [sortedEntries, page, itemsPerPage],
  );

  return (
    <div ref={tableTopRef} className="@container space-y-3">
      <PaginationControls
        itemsPerPage={itemsPerPage}
        onItemsPerPageChange={setItemsPerPage}
        currentPage={page}
        onPageChange={setCurrentPage}
        totalPages={totalPages}
      />
      <Table>
        <TableHeader className="bg-muted">
          <TableRow>
            <TableHead className="w-14">
              <span className="@md:hidden">W/L</span>
              <span className="hidden @md:inline">Result</span>
            </TableHead>
            <TableHead>Hero</TableHead>
            <TableHead className="hidden @3xl:table-cell">Mode</TableHead>
            <SortableHead sortKey="kda" {...sortProps} className="text-right" title="Sort by KDA ratio">
              K / D / A
            </SortableHead>
            <SortableHead sortKey="souls" {...sortProps} className="hidden text-right @md:table-cell">
              Souls
            </SortableHead>
            <SortableHead sortKey="soulsPerMin" {...sortProps} className="hidden text-right @2xl:table-cell">
              Souls/min
            </SortableHead>
            <SortableHead
              sortKey="lastHits"
              {...sortProps}
              className="hidden text-right @5xl:table-cell"
              title="Last hits / Denies"
            >
              LH / DN
            </SortableHead>
            <SortableHead sortKey="duration" {...sortProps} className="hidden text-right @3xl:table-cell">
              Duration
            </SortableHead>
            <SortableHead sortKey="rankDelta" {...sortProps} className="text-right" title="Sort by rank change">
              Rank
            </SortableHead>
            <SortableHead sortKey="played" {...sortProps} className="text-right">
              <span className="@xl:hidden">Date</span>
              <span className="hidden @xl:inline">Played</span>
            </SortableHead>
            <TableHead className="hidden text-right @5xl:table-cell">Match ID</TableHead>
            <TableHead className="hidden w-8 @5xl:table-cell" />
            <TableHead className="hidden w-8 @md:table-cell" />
          </TableRow>
        </TableHeader>
        <TableBody onKeyDown={handleRowKeyDown}>
          {paginatedEntries.map((entry, index) => {
            const expanded = expandedMatchId === entry.match_id;
            const session = sessions.get(entry.match_id);
            const startsSession =
              session != null && (index === 0 || sessions.get(paginatedEntries[index - 1].match_id) !== session);
            return (
              <Fragment key={entry.match_id}>
                {startsSession && <SessionRow session={session} />}
                <MatchRow
                  ref={expanded ? linkedRowRef : undefined}
                  entry={entry}
                  ranks={ranks}
                  heroName={heroNames?.get(entry.hero_id) ?? "Unknown"}
                  records={heldRecords?.get(entry.match_id)}
                  heroFiltered={heroId != null}
                  onToggleHeroFilter={() => toggleHeroFilter(entry.hero_id)}
                  expanded={expanded}
                  onToggle={() => setExpandedMatchId(expanded ? null : entry.match_id)}
                />
                {expanded && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={COLUMN_COUNT} className="relative bg-muted/30 p-4 whitespace-normal">
                      <ResultEdge win={isWin(entry)} />
                      <MatchRowDetails
                        entry={entry}
                        accountId={accountId}
                        ranks={ranks}
                        heroSummary={heroSummaries.get(entry.hero_id) as TrackerSummary}
                      />
                      <div className="mt-3 flex justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={collapseExpanded}
                          className="h-6 gap-1 px-2 text-xs text-muted-foreground"
                        >
                          <ChevronUp className="size-3.5" />
                          Collapse
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}
          {paginatedEntries.length === 0 && (
            <TableRow>
              <TableCell colSpan={COLUMN_COUNT} className="py-8 text-center text-muted-foreground">
                No matches found
              </TableCell>
            </TableRow>
          )}
        </TableBody>
        {entries.length > 1 && (
          <TableFooter>
            <AverageRow summary={summary} />
          </TableFooter>
        )}
      </Table>
      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm text-muted-foreground">
          <span className="mr-2 tabular-nums">
            Page {page + 1} of {totalPages}
          </span>
          <Button variant="outline" size="sm" onClick={() => turnPageFromBelow(page - 1)} disabled={page === 0}>
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => turnPageFromBelow(page + 1)}
            disabled={page >= totalPages - 1}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
