import { useQuery } from "@tanstack/react-query";
import type { PlayerEntry } from "deadlock_api_client";
import Fuse from "fuse.js";
import { useDeferredValue, useMemo } from "react";

import { BadgeImage } from "~/components/domain/assets/BadgeImage";
import { PlayerCell } from "~/components/domain/player/PlayerCell";
import { PaginationControls } from "~/components/patterns/data-table/PaginationControls";
import { SortableHeader } from "~/components/patterns/data-table/SortableHeader";
import { TableEmptyRow } from "~/components/patterns/data-table/TableEmptyRow";
import { SearchInput } from "~/components/ui/search-input";
import { ariaSort, SortButton } from "~/components/ui/sort-button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { usePaginationQueryState } from "~/hooks/usePaginationQueryState";
import { useSteamProfiles } from "~/hooks/useSteamProfiles";
import { extractBadgeMap } from "~/lib/leaderboard";
import { ranksQueryOptions } from "~/queries/ranks-query";

import { formatStatValue } from "./sort-options";
import { SortBySelector } from "./SortBySelector";

export type ScoreboardSort = { sortBy: string; sortDirection: "desc" | "asc" };

interface ScoreboardTableProps extends React.ComponentProps<"div"> {
  entries: PlayerEntry[];
  sortBy: string;
  sortDirection: "desc" | "asc";
  /** The header always sets column and direction together, so one callback carries both. */
  onSortChange?: (sort: ScoreboardSort) => void;
}

export function ScoreboardTable({
  entries,
  sortBy,
  sortDirection,
  onSortChange,
  className,
  ...props
}: ScoreboardTableProps) {
  const sort = (next: ScoreboardSort) => onSortChange?.(next);
  const flip = (): "desc" | "asc" => (sortDirection === "desc" ? "asc" : "desc");
  const {
    searchQuery,
    setSearchQuery,
    currentPage: requestedPage,
    setCurrentPage,
    itemsPerPage,
    setItemsPerPage,
  } = usePaginationQueryState();

  const steamAccountIds = useMemo(
    () => entries.map((e) => e.account_id).filter((id): id is number => id != null),
    [entries],
  );

  const { profiles, isLoading: isLoadingProfiles } = useSteamProfiles(steamAccountIds);

  const isRankSort = sortBy === "rank";
  const { data: ranks } = useQuery({ ...ranksQueryOptions, enabled: isRankSort });
  const badgeMap = useMemo(() => extractBadgeMap(ranks ?? []), [ranks]);

  const renderValue = (value: number) => {
    if (!isRankSort) return formatStatValue(value, sortBy);
    const badge = badgeMap.get(value);
    if (!badge) return <span className="text-muted-foreground">Unranked</span>;
    return (
      <div className="flex items-center justify-end gap-1.5">
        <BadgeImage badge={value} ranks={ranks ?? []} className="size-6" />
        <span>{`${badge.name} ${badge.subtier}`}</span>
      </div>
    );
  };

  const enrichedEntries = useMemo(
    () =>
      entries.map((entry) => {
        const profile = entry.account_id != null ? profiles[entry.account_id] : undefined;
        return { ...entry, personaname: profile?.personaname };
      }),
    [entries, profiles],
  );

  const fuse = useMemo(
    () =>
      new Fuse(enrichedEntries, {
        keys: ["personaname", "account_id"],
        // A name contains the query anywhere, with a typo or two; 0.4 with position scoring let "mar" fill pages
        // with "Gary", "MrXer" and "Parzelion".
        threshold: 0.3,
        ignoreLocation: true,
      }),
    [enrichedEntries],
  );

  // Echo keystrokes before searching and rendering the result rows.
  const deferredSearchQuery = useDeferredValue(searchQuery);

  const filteredEntries = useMemo(
    () => (deferredSearchQuery ? fuse.search(deferredSearchQuery).map((r) => r.item) : enrichedEntries),
    [deferredSearchQuery, enrichedEntries, fuse],
  );

  const totalPages = Math.max(1, Math.ceil(filteredEntries.length / itemsPerPage));
  // A filter change can leave the URL's page past the end of the new board.
  const currentPage = Math.min(requestedPage, totalPages - 1);

  const paginatedEntries = useMemo(
    () => filteredEntries.slice(currentPage * itemsPerPage, (currentPage + 1) * itemsPerPage),
    [filteredEntries, currentPage, itemsPerPage],
  );
  const handleItemsPerPageChange = (perPage: number) => {
    setItemsPerPage(perPage);
    setCurrentPage(0);
  };

  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    setCurrentPage(0);
  };

  const controls = (
    <PaginationControls
      page={currentPage}
      onPageChange={setCurrentPage}
      pageSize={itemsPerPage}
      onPageSizeChange={handleItemsPerPageChange}
      totalPages={totalPages}
    >
      <SearchInput
        size="sm"
        placeholder="Search player..."
        aria-label="Search player"
        value={searchQuery}
        onValueChange={handleSearchChange}
      />
    </PaginationControls>
  );

  return (
    <div className={className} {...props}>
      {controls}
      <Table density="compact" className="tabular-nums">
        <TableHeader tone="muted">
          <TableRow>
            <TableHead className="w-8 text-end sm:w-12">#</TableHead>
            <TableHead>Player</TableHead>
            {sortBy !== "matches" && (
              <SortableHeader
                label="Matches"
                sortKey="matches"
                activeSortKey={sortBy}
                sortDir={sortDirection}
                align="end"
                className="hidden sm:table-cell"
                onSortChange={() =>
                  sort(
                    sortBy === "matches"
                      ? { sortBy, sortDirection: flip() }
                      : { sortBy: "matches", sortDirection: "desc" },
                  )
                }
              />
            )}
            <TableHead className="text-end" aria-sort={ariaSort(true, sortDirection)}>
              <div className="flex items-center justify-end gap-1">
                <SortBySelector
                  value={sortBy}
                  defaultValue="kills"
                  // The name column gives way first; below this the picker shrank to an unreadable "S…".
                  className="min-w-24"
                  onValueChange={(next) => sort({ sortBy: next, sortDirection })}
                />
                <SortButton
                  active
                  sortDir={sortDirection}
                  onClick={() => sort({ sortBy, sortDirection: flip() })}
                  aria-label="Toggle sort direction"
                />
              </div>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {paginatedEntries.map((entry, i) => {
            const accountId = entry.account_id;
            const profile = accountId != null ? profiles[accountId] : undefined;
            return (
              // oxlint-disable-next-line react/no-array-index-key
              <TableRow key={`${accountId ?? i}-${entry.rank}`}>
                <TableCell className="text-end">{entry.rank + 1}</TableCell>
                {/* `w-full max-w-0` hands this column whatever the others leave, and the name truncates inside it. */}
                <TableCell className="w-full max-w-0">
                  <PlayerCell
                    accountId={accountId}
                    name={profile?.personaname ?? (accountId == null ? `#${entry.rank + 1}` : undefined)}
                    avatar={profile?.avatar}
                    loading={isLoadingProfiles && !profile}
                    showAccountId
                    linkToDetail
                    className="sm:max-w-72"
                  />
                </TableCell>
                {sortBy !== "matches" && (
                  <TableCell className="hidden text-end sm:table-cell">
                    {entry.matches.toLocaleString("en-US")}
                  </TableCell>
                )}
                <TableCell className="text-end">{renderValue(entry.value)}</TableCell>
              </TableRow>
            );
          })}
          {paginatedEntries.length === 0 && <TableEmptyRow colSpan={sortBy === "matches" ? 3 : 4} />}
        </TableBody>
      </Table>
      {controls}
    </div>
  );
}
