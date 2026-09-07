import { useQuery } from "@tanstack/react-query";
import type { PlayerMatchHistoryEntry, Rank } from "deadlock_api_client";
import { ArrowDown, ArrowUp } from "lucide-react";
import { parseAsInteger, parseAsStringLiteral, useQueryState, useQueryStates } from "nuqs";
import { type ComponentProps, Fragment, useEffect, useMemo, useRef, useState } from "react";

import { PaginationControls } from "~/components/PaginationControls";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { day } from "~/dayjs";
import {
  computeRecords,
  computeSessions,
  formatPlaytime,
  MATCH_SORT_KEYS,
  type MatchSortKey,
  type PlaySession,
  recordsByMatchId,
  SORT_DIRS,
  type SortDir,
  sortMatches,
  summarizeByHero,
  type TrackerSummary,
} from "~/lib/tracker/compute";
import { cn } from "~/lib/utils";
import { heroesQueryOptions } from "~/queries/asset-queries";

import { LOSS_TEXT_CLASS, WIN_TEXT_CLASS } from "../shared/colors";
import { MatchRow } from "./MatchRow";
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
          {session.rankDelta != null && session.rankDelta !== 0 && (
            <span
              className={cn("font-semibold tabular-nums", session.rankDelta > 0 ? WIN_TEXT_CLASS : LOSS_TEXT_CLASS)}
              title="Net rank change over the session"
            >
              {session.rankDelta > 0 ? `+${session.rankDelta}` : session.rankDelta}
            </span>
          )}
          <span className="ml-auto text-muted-foreground tabular-nums">
            {session.matches} {session.matches === 1 ? "match" : "matches"} · {formatPlaytime(session.totalTimeS)}
          </span>
        </div>
      </TableCell>
    </TableRow>
  );
}

export function MatchesTab({
  entries,
  ranks,
  accountId,
}: {
  entries: PlayerMatchHistoryEntry[];
  ranks: Rank[];
  accountId: number;
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

  const handleSort = (key: MatchSortKey) => {
    setSort(sortKey === key ? { dir: sortDir === "desc" ? "asc" : "desc" } : { sort: key, dir: "desc" });
    setCurrentPage(0);
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
    <div className="@container space-y-3">
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
            <SortableHead
              sortKey="kda"
              activeKey={sortKey}
              dir={sortDir}
              onSort={handleSort}
              className="text-right"
              title="Sort by KDA ratio"
            >
              K / D / A
            </SortableHead>
            <SortableHead
              sortKey="souls"
              activeKey={sortKey}
              dir={sortDir}
              onSort={handleSort}
              className="hidden text-right @md:table-cell"
            >
              Souls
            </SortableHead>
            <SortableHead
              sortKey="soulsPerMin"
              activeKey={sortKey}
              dir={sortDir}
              onSort={handleSort}
              className="hidden text-right @2xl:table-cell"
            >
              Souls/min
            </SortableHead>
            <SortableHead
              sortKey="lastHits"
              activeKey={sortKey}
              dir={sortDir}
              onSort={handleSort}
              className="hidden text-right @4xl:table-cell"
              title="Last hits / Denies"
            >
              LH / DN
            </SortableHead>
            <SortableHead
              sortKey="duration"
              activeKey={sortKey}
              dir={sortDir}
              onSort={handleSort}
              className="hidden text-right @3xl:table-cell"
            >
              Duration
            </SortableHead>
            <SortableHead
              sortKey="rankDelta"
              activeKey={sortKey}
              dir={sortDir}
              onSort={handleSort}
              className="text-right"
              title="Sort by rank change"
            >
              Rank
            </SortableHead>
            <SortableHead sortKey="played" activeKey={sortKey} dir={sortDir} onSort={handleSort} className="text-right">
              Played
            </SortableHead>
            <TableHead className="hidden text-right @4xl:table-cell">Match ID</TableHead>
            <TableHead className="hidden w-8 @4xl:table-cell" />
            <TableHead className="hidden w-8 @md:table-cell" />
          </TableRow>
        </TableHeader>
        <TableBody>
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
                  expanded={expanded}
                  onToggle={() => setExpandedMatchId(expanded ? null : entry.match_id)}
                />
                {expanded && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={COLUMN_COUNT} className="bg-muted/30 p-4 whitespace-normal">
                      <MatchRowDetails
                        entry={entry}
                        accountId={accountId}
                        ranks={ranks}
                        heroSummary={heroSummaries.get(entry.hero_id) as TrackerSummary}
                      />
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
      </Table>
    </div>
  );
}
