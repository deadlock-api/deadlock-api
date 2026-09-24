import type { Leaderboard } from "deadlock_api_client";
import Fuse from "fuse.js";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

import { HeroImage } from "~/components/domain/assets/HeroImage";
import { TableEmptyRow } from "~/components/patterns/data-table/TableEmptyRow";
import { Button } from "~/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { Tooltip } from "~/components/ui/tooltip";
import { useHeroById } from "~/hooks/useAssetById";
import { usePaginationQueryState } from "~/hooks/usePaginationQueryState";

import { LeaderboardControls } from "./LeaderboardControls";

export interface LeaderboardTableProps {
  leaderboard: Leaderboard;
  onHeroClick: (heroId: number) => void;
}

interface LeaderboardTableRowProps {
  entry: Leaderboard["entries"][number];
  isHighlighted: boolean;
  shouldShowTopHeroesColumn: boolean;
  onHeroClick: (heroId: number) => void;
}

export function LeaderboardTable({ leaderboard, onHeroClick }: LeaderboardTableProps) {
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
      if (inResults < 0) setSearchQuery("");
      setCurrentPage(Math.floor(index / itemsPerPage));
      setHighlightedRank(rank);
    },
    [filteredEntries, sortedEntries, itemsPerPage, setCurrentPage, setSearchQuery],
  );

  const controls = (
    <LeaderboardControls
      onJumpToRank={jumpToRank}
      searchQuery={searchQuery}
      setSearchQuery={setSearchQuery}
      itemsPerPage={itemsPerPage}
      setItemsPerPage={setItemsPerPage}
      currentPage={currentPage}
      setCurrentPage={setCurrentPage}
      totalPages={totalPages}
    />
  );

  return (
    <div>
      {controls}
      <Table density="compact" className="tabular-nums">
        <TableHeader tone="muted">
          <TableRow>
            <TableHead className="w-12 text-end">#</TableHead>
            <TableHead>Account Name</TableHead>
            {shouldShowTopHeroesColumn && <TableHead className="min-w-28 text-end">Top Heroes</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody aria-busy={searchQuery !== deferredSearchQuery}>
          {paginatedEntries.map((entry) => (
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
      {controls}
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
          <div className="flex min-h-7 justify-end gap-1">
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
      <Button variant="ghost" size="icon-sm" shape="pill" onClick={onClick} aria-label={label}>
        <HeroImage hero={hero} loading={isLoading} shape="circle" ring="border" className="size-7" />
      </Button>
    </Tooltip>
  );
}
