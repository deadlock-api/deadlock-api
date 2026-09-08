import type { Leaderboard } from "deadlock_api_client";
import Fuse from "fuse.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { HeroImage } from "~/components/HeroImage";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import { useHeroById } from "~/hooks/useAssetById";
import { usePaginationQueryState } from "~/hooks/usePaginationQueryState";
import { cn } from "~/lib/utils";

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

  const sortedEntries = useMemo(
    () => [...leaderboard.entries].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0)),
    [leaderboard.entries],
  );

  const fuse = useMemo(
    () =>
      new Fuse(sortedEntries, {
        keys: ["account_name"],
        threshold: 0.4,
      }),
    [sortedEntries],
  );

  const filteredEntries = useMemo(
    () => (searchQuery ? fuse.search(searchQuery).map((r) => r.item) : sortedEntries),
    [searchQuery, sortedEntries, fuse],
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
      const index = filteredEntries.findIndex((entry) => entry.rank === rank);
      if (index < 0) return;
      setCurrentPage(Math.floor(index / itemsPerPage));
      setHighlightedRank(rank);
    },
    [filteredEntries, itemsPerPage, setCurrentPage],
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
      <Table>
        <TableHeader className="bg-muted">
          <TableRow>
            <TableHead className="w-[5ch] text-right">#</TableHead>
            <TableHead>Account Name</TableHead>
            {shouldShowTopHeroesColumn && <TableHead className="min-w-40 text-right">Top Heroes</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {paginatedEntries.map((entry) => (
            <LeaderboardTableRow
              key={`${entry.account_name}-${entry.rank}`}
              entry={entry}
              isHighlighted={entry.rank === highlightedRank}
              shouldShowTopHeroesColumn={shouldShowTopHeroesColumn}
              onHeroClick={onHeroClick}
            />
          ))}
          {paginatedEntries.length === 0 && (
            <TableRow>
              <TableCell colSpan={shouldShowTopHeroesColumn ? 3 : 2} className="py-8 text-center text-muted-foreground">
                No results found
              </TableCell>
            </TableRow>
          )}
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
    <TableRow ref={rowRef} className={cn(isHighlighted && "bg-primary/10 hover:bg-primary/15")}>
      <TableCell className="text-right">{entry.rank}</TableCell>
      <TableCell className="max-w-[200px] truncate">{entry.account_name}</TableCell>
      {shouldShowTopHeroesColumn && (
        <TableCell>
          <div className="flex min-h-8 justify-end space-x-3">
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
  const { hero } = useHeroById(heroId);
  const label = hero ? `Filter by ${hero.name}` : "Filter by hero";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" onClick={onClick} className="cursor-pointer" aria-label={label}>
          <HeroImage heroId={heroId} className="h-8 w-8 rounded-full border border-border object-cover" />
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
