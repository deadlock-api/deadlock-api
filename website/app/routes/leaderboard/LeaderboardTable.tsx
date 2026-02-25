import type { RankV2 } from "assets_deadlock_api_client";
import type { Leaderboard } from "deadlock_api_client";
import Fuse from "fuse.js";
import { forwardRef, useImperativeHandle, useMemo, useState } from "react";
import BadgeImage from "~/components/BadgeImage";
import HeroImage from "~/components/HeroImage";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { extractBadgeMap, type SubtierInfo } from "~/lib/leaderboard";
import { hexToRgba } from "~/lib/utils";
import { LeaderboardControls } from "./LeaderboardControls";

export interface LeaderboardTableHandle {
  jumpToRank: (rank: number) => void;
}

export interface LeaderboardTableProps {
  ranks: RankV2[];
  leaderboard: Leaderboard;
  onHeroClick: (heroId: number) => void;
}

interface LeaderboardTableRowProps {
  entry: Leaderboard["entries"][number];
  ranks: RankV2[];
  badgeMap: Map<number, SubtierInfo>;
  shouldShowBadgeColumn: boolean;
  shouldShowTopHeroesColumn: boolean;
  onHeroClick: (heroId: number) => void;
}

export const LeaderboardTable = forwardRef<LeaderboardTableHandle, LeaderboardTableProps>(function LeaderboardTable(
  { ranks, leaderboard, onHeroClick },
  ref,
) {
  const badgeMap = useMemo(() => extractBadgeMap(ranks), [ranks]);

  const [currentPage, setCurrentPage] = useState(0);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [searchQuery, setSearchQuery] = useState("");

  const sortedEntries = useMemo(
    () => leaderboard.entries.sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0)),
    [leaderboard.entries],
  );

  useImperativeHandle(
    ref,
    () => ({
      jumpToRank(rank: number) {
        setSearchQuery("");
        const index = sortedEntries.findIndex((e) => e.rank === rank);
        if (index !== -1) {
          setCurrentPage(Math.floor(index / itemsPerPage));
        }
      },
    }),
    [sortedEntries, itemsPerPage],
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

  const shouldShowBadgeColumn = useMemo(() => filteredEntries.some((e) => e.badge_level), [filteredEntries]);

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
        <TableHeader>
          <TableRow>
            <TableHead className="w-[5ch] text-right">#</TableHead>
            {shouldShowBadgeColumn && <TableHead className="text-center">Rank</TableHead>}
            <TableHead>Account Name</TableHead>
            {shouldShowTopHeroesColumn && <TableHead className="min-w-40 text-right">Top Heroes</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {paginatedEntries.map((entry) => (
            <LeaderboardTableRow
              key={`${entry.account_name}-${entry.rank}`}
              entry={entry}
              ranks={ranks}
              badgeMap={badgeMap}
              shouldShowBadgeColumn={shouldShowBadgeColumn}
              shouldShowTopHeroesColumn={shouldShowTopHeroesColumn}
              onHeroClick={onHeroClick}
            />
          ))}
        </TableBody>
      </Table>
      {controls}
    </div>
  );
});

function LeaderboardTableRow({
  entry,
  ranks,
  badgeMap,
  shouldShowBadgeColumn,
  shouldShowTopHeroesColumn,
  onHeroClick,
}: LeaderboardTableRowProps) {
  const backgroundColor = useMemo(() => {
    const rowColor = entry.badge_level ? badgeMap.get(entry.badge_level)?.color : undefined;
    return rowColor ? hexToRgba(rowColor, 0.1) : undefined;
  }, [entry.badge_level, badgeMap]);

  return (
    <TableRow key={`${entry.account_name}-${entry.rank}`} style={backgroundColor ? { backgroundColor } : undefined}>
      <TableCell className="text-right">{entry.rank}</TableCell>
      {shouldShowBadgeColumn && (
        <TableCell className="flex justify-center">
          {entry.badge_level && (
            <BadgeImage badge={entry.badge_level} ranks={ranks} imageType="small" className="h-8 w-8" />
          )}
        </TableCell>
      )}
      <TableCell className="truncate max-w-[200px]">{entry.account_name}</TableCell>
      {shouldShowTopHeroesColumn && (
        <TableCell>
          <div className="flex justify-end space-x-3">
            {entry.top_hero_ids?.map((heroId) => (
              <button key={heroId} type="button" onClick={() => onHeroClick(heroId)} className="cursor-pointer">
                <HeroImage heroId={heroId} className="h-8 w-8 rounded-full object-cover border border-gray-700" />
              </button>
            ))}
          </div>
        </TableCell>
      )}
    </TableRow>
  );
}
