import type { Leaderboard } from "deadlock_api_client";
import Fuse from "fuse.js";
import { useMemo, useState } from "react";

import { HeroImage } from "~/components/HeroImage";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";

import { LeaderboardControls } from "./LeaderboardControls";

export interface LeaderboardTableProps {
  leaderboard: Leaderboard;
  onHeroClick: (heroId: number) => void;
}

interface LeaderboardTableRowProps {
  entry: Leaderboard["entries"][number];
  shouldShowTopHeroesColumn: boolean;
  onHeroClick: (heroId: number) => void;
}

export function LeaderboardTable({ leaderboard, onHeroClick }: LeaderboardTableProps) {
  const [currentPage, setCurrentPage] = useState(0);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [searchQuery, setSearchQuery] = useState("");

  const sortedEntries = useMemo(
    () => leaderboard.entries.sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0)),
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

  const paginatedEntries = useMemo(() => {
    const startIndex = currentPage * itemsPerPage;
    return filteredEntries.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredEntries, currentPage, itemsPerPage]);

  const controls = (
    <LeaderboardControls
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
              shouldShowTopHeroesColumn={shouldShowTopHeroesColumn}
              onHeroClick={onHeroClick}
            />
          ))}
        </TableBody>
      </Table>
      {controls}
    </div>
  );
}

function LeaderboardTableRow({ entry, shouldShowTopHeroesColumn, onHeroClick }: LeaderboardTableRowProps) {
  return (
    <TableRow key={`${entry.account_name}-${entry.rank}`}>
      <TableCell className="text-right">{entry.rank}</TableCell>
      <TableCell className="max-w-[200px] truncate">{entry.account_name}</TableCell>
      {shouldShowTopHeroesColumn && (
        <TableCell>
          <div className="flex justify-end space-x-3">
            {entry.top_hero_ids?.map((heroId) => (
              <button key={heroId} type="button" onClick={() => onHeroClick(heroId)} className="cursor-pointer">
                <HeroImage heroId={heroId} className="h-8 w-8 rounded-full border border-border object-cover" />
              </button>
            ))}
          </div>
        </TableCell>
      )}
    </TableRow>
  );
}
