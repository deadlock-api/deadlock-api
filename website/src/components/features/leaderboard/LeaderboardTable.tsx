import type { Leaderboard } from "deadlock_api_client";
import Fuse from "fuse.js";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

import { HeroImage } from "~/components/domain/assets/HeroImage";
import { PaginationStatus } from "~/components/patterns/data-table/PaginationControls";
import { TableEmptyRow } from "~/components/patterns/data-table/TableEmptyRow";
import { Button } from "~/components/ui/button";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { Tooltip } from "~/components/ui/tooltip";
import { useHeroById } from "~/hooks/useAssetById";
import { usePaginationQueryState } from "~/hooks/usePaginationQueryState";

import { LeaderboardControls } from "./LeaderboardControls";

export interface LeaderboardTableProps {
  leaderboard: Leaderboard;
  /** Names the table for assistive technology: "Europe leaderboard". */
  label: string;
  onHeroClick: (heroId: number) => void;
}

interface LeaderboardTableRowProps {
  entry: Leaderboard["entries"][number];
  isHighlighted: boolean;
  shouldShowTopHeroesColumn: boolean;
  onHeroClick: (heroId: number) => void;
}

export function LeaderboardTable({ leaderboard, label, onHeroClick }: LeaderboardTableProps) {
  const {
    searchQuery,
    setSearchQuery,
    currentPage: requestedPage,
    setCurrentPage,
    itemsPerPage,
    setItemsPerPage,
  } = usePaginationQueryState();
  const [highlightedRank, setHighlightedRank] = useState<number | null>(null);
  // Echo keystrokes before searching and rendering the result rows.
  const deferredSearchQuery = useDeferredValue(searchQuery);

  const sortedEntries = useMemo(
    () => [...leaderboard.entries].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0)),
    [leaderboard.entries],
  );

  const fuse = useMemo(
    () =>
      new Fuse(sortedEntries, {
        keys: ["account_name"],
        // A name contains the query anywhere, with a typo or two; 0.4 with position scoring let "mar" fill pages
        // with "Gary", "MrXer" and "Parzelion".
        threshold: 0.3,
        ignoreLocation: true,
      }),
    [sortedEntries],
  );

  const filteredEntries = useMemo(
    () => (deferredSearchQuery ? fuse.search(deferredSearchQuery).map((r) => r.item) : sortedEntries),
    [deferredSearchQuery, sortedEntries, fuse],
  );

  const shouldShowTopHeroesColumn = useMemo(
    () => filteredEntries.some((e) => e.top_hero_ids && e.top_hero_ids.length > 0),
    [filteredEntries],
  );

  const totalPages = useMemo(
    () => Math.ceil(filteredEntries.length / itemsPerPage),
    [filteredEntries.length, itemsPerPage],
  );
  // A region or hero switch can leave the URL's page past the end of the new board.
  const currentPage = Math.min(requestedPage, Math.max(0, totalPages - 1));

  const paginatedEntries = useMemo(() => {
    const startIndex = currentPage * itemsPerPage;
    return filteredEntries.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredEntries, currentPage, itemsPerPage]);

  const jumpToRank = useCallback(
    (rank: number) => {
      // A rank the search filtered out is still on the board: the search is cleared to show it.
      const inResults = filteredEntries.findIndex((entry) => entry.rank === rank);
      const index = inResults >= 0 ? inResults : sortedEntries.findIndex((entry) => entry.rank === rank);
      if (index < 0) return;
      if (inResults < 0) void setSearchQuery("");
      void setCurrentPage(Math.floor(index / itemsPerPage));
      setHighlightedRank(rank);
    },
    [filteredEntries, sortedEntries, itemsPerPage, setCurrentPage, setSearchQuery],
  );

  // The page's rows split into two boards for a wide screen. The first takes an even count, so the stripes run on
  // unbroken when the second continues it underneath.
  const firstColumnSize = Math.ceil(paginatedEntries.length / 4) * 2;
  const columns =
    paginatedEntries.length > 1
      ? [paginatedEntries.slice(0, firstColumnSize), paginatedEntries.slice(firstColumnSize)]
      : [paginatedEntries];

  const controlProps = {
    onJumpToRank: jumpToRank,
    searchQuery,
    setSearchQuery,
    itemsPerPage,
    setItemsPerPage,
    currentPage,
    setCurrentPage,
    totalPages,
  };

  return (
    <div>
      <LeaderboardControls placement="header" {...controlProps} />
      <PaginationStatus
        page={currentPage}
        totalPages={totalPages}
        total={filteredEntries.length}
        noun="player"
        query={deferredSearchQuery}
      />
      {/* From a container of 80rem the page's rows flow into two side-by-side boards that share their row height, so a
          wide screen shows twice the ranks and a hero sits beside its name instead of 2000px away. Narrower, the
          second board continues the first under it, without a second head row. */}
      <div className="@container">
        <div className="grid gap-x-6 @7xl:grid-cols-2">
          {columns.map((rows, column) => (
            <Table key={column} density="compact" className="tabular-nums">
              <TableCaption visibility="sr-only">
                {columns.length > 1 && rows.length > 0
                  ? `${label}, ranks ${rows[0].rank} to ${rows.at(-1)?.rank}`
                  : label}
              </TableCaption>
              <TableHeader tone="muted" className={column > 0 ? "hidden @7xl:table-header-group" : undefined}>
                <TableRow>
                  <TableHead className="w-12 text-end">
                    <span aria-hidden="true">#</span>
                    <span className="sr-only">Rank</span>
                  </TableHead>
                  <TableHead>Account Name</TableHead>
                  {shouldShowTopHeroesColumn && <TableHead className="min-w-28 text-end">Top Heroes</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody aria-busy={searchQuery !== deferredSearchQuery}>
                {rows.map((entry) => (
                  <LeaderboardTableRow
                    key={`${entry.account_name}-${entry.rank}`}
                    entry={entry}
                    isHighlighted={entry.rank === highlightedRank}
                    shouldShowTopHeroesColumn={shouldShowTopHeroesColumn}
                    onHeroClick={onHeroClick}
                  />
                ))}
                {paginatedEntries.length === 0 && <TableEmptyRow colSpan={shouldShowTopHeroesColumn ? 3 : 2} />}
              </TableBody>
            </Table>
          ))}
        </div>
      </div>
      <LeaderboardControls placement="footer" {...controlProps} />
    </div>
  );
}

function LeaderboardTableRow({
  entry,
  isHighlighted,
  shouldShowTopHeroesColumn,
  onHeroClick,
}: LeaderboardTableRowProps) {
  const rowRef = useRef<HTMLTableRowElement>(null);
  useEffect(() => {
    if (isHighlighted) rowRef.current?.scrollIntoView({ block: "center" });
  }, [isHighlighted]);

  return (
    <TableRow ref={rowRef} data-state={isHighlighted ? "current" : undefined}>
      <TableCell className="text-end">{entry.rank}</TableCell>
      {/* `w-full max-w-0` gives the name what the top heroes leave, so on a phone it truncates instead of pushing
          them off-screen. */}
      <TableCell className="w-full max-w-0 truncate" title={entry.account_name ?? undefined}>
        {entry.account_name}
      </TableCell>
      {shouldShowTopHeroesColumn && (
        <TableCell>
          <div className="flex justify-end gap-1">
            {entry.top_hero_ids?.map((heroId) => (
              <TopHeroButton key={heroId} heroId={heroId} onClick={() => onHeroClick(heroId)} />
            ))}
          </div>
        </TableCell>
      )}
    </TableRow>
  );
}

function TopHeroButton({ heroId, onClick }: { heroId: number; onClick: () => void }) {
  const { hero, isLoading } = useHeroById(heroId);
  const label = hero ? `Filter by ${hero.name}` : "Filter by hero";
  return (
    <Tooltip content={label}>
      <Button variant="ghost" size="icon-xs" shape="pill" onClick={onClick} aria-label={label}>
        <HeroImage hero={hero} loading={isLoading} shape="circle" ring="border" className="size-6" />
      </Button>
    </Tooltip>
  );
}
