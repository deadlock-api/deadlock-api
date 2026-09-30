import { useQuery } from "@tanstack/react-query";
import type { PlayerEntry } from "deadlock_api_client";
import Fuse from "fuse.js";
import { CheckIcon, PlusIcon } from "lucide-react";
import { useDeferredValue, useMemo } from "react";

import { BadgeImage } from "~/components/domain/assets/BadgeImage";
import { PlayerCell } from "~/components/domain/player/PlayerCell";
import { PaginationControls, PaginationStatus } from "~/components/patterns/data-table/PaginationControls";
import { SortableHeader } from "~/components/patterns/data-table/SortableHeader";
import { TableEmptyRow } from "~/components/patterns/data-table/TableEmptyRow";
import { Button } from "~/components/ui/button";
import { SearchInput } from "~/components/ui/search-input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { usePaginationQueryState } from "~/hooks/usePaginationQueryState";
import { useSteamProfiles } from "~/hooks/useSteamProfiles";
import { extractBadgeMap } from "~/lib/leaderboard";
import { parseSteamIdInput } from "~/lib/steam";
import { ranksQueryOptions } from "~/queries/ranks-query";

import { formatStatValue, sortByLabel } from "./sort-options";

/** A row's add-to-comparison toggle: a plus to add, a check once added. */
function PickToggle({
  name,
  picked,
  full,
  onClick,
}: {
  name: string;
  picked: boolean;
  /** No room for another pick; an added player can still be removed. */
  full: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      variant="toggle"
      size="icon-sm"
      aria-pressed={picked}
      aria-label={picked ? `Remove ${name} from the comparison` : `Add ${name} to the comparison`}
      title={picked ? "Remove from comparison" : "Add to comparison"}
      disabled={!picked && full}
      onClick={onClick}
    >
      {picked ? <CheckIcon aria-hidden="true" /> : <PlusIcon aria-hidden="true" />}
    </Button>
  );
}

export type ScoreboardSort = { sortBy: string; sortDirection: "desc" | "asc" };

interface ScoreboardTableProps extends React.ComponentProps<"div"> {
  entries: PlayerEntry[];
  sortBy: string;
  sortDirection: "desc" | "asc";
  /** The header always sets column and direction together, so one callback carries both. */
  onSortChange?: (sort: ScoreboardSort) => void;
  /**
   * The players picked on the board (for a comparison): with it, each row ends in a toggle that adds or removes its
   * player, and `onValueChange` receives the new picks. Without it, rows have no toggle.
   */
  selectedAccountIds?: readonly number[];
  onValueChange?: (accountIds: number[]) => void;
  /** How many players can be picked; the other toggles disable once it's reached. */
  maxSelected?: number;
  /** The pick column's header, e.g. the action that uses the picks; "Compare" when left out. */
  pickHeader?: React.ReactNode;
}

export function ScoreboardTable({
  entries,
  sortBy,
  sortDirection,
  onSortChange,
  selectedAccountIds,
  onValueChange,
  maxSelected = Number.POSITIVE_INFINITY,
  pickHeader = "Compare",
  className,
  ...props
}: ScoreboardTableProps) {
  const sort = (next: ScoreboardSort) => onSortChange?.(next);
  const selectable = selectedAccountIds !== undefined;
  const togglePick = (accountId: number) => {
    const picked = selectedAccountIds ?? [];
    onValueChange?.(picked.includes(accountId) ? picked.filter((id) => id !== accountId) : [...picked, accountId]);
  };
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

  const isRankSort = sortBy === "rank" || sortBy === "peak_rank";
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
        keys: ["personaname"],
        // A name contains the query anywhere, with a typo or two; 0.4 with position scoring let "mar" fill pages
        // with "Gary", "MrXer" and "Parzelion".
        threshold: 0.3,
        ignoreLocation: true,
      }),
    [enrichedEntries],
  );

  // Echo keystrokes before searching and rendering the result rows.
  const deferredSearchQuery = useDeferredValue(searchQuery);

  // An account id is matched as a number, not fuzzily: "725757673" found "757536738" a typo or two away.
  const filteredEntries = useMemo(() => {
    if (!deferredSearchQuery) return enrichedEntries;
    const parsed = parseSteamIdInput(deferredSearchQuery);
    if ("steamId3" in parsed) {
      const query = deferredSearchQuery.trim();
      return enrichedEntries.filter((entry) => entry.account_id === parsed.steamId3 || entry.personaname === query);
    }
    return fuse.search(deferredSearchQuery).map((r) => r.item);
  }, [deferredSearchQuery, enrichedEntries, fuse]);

  const totalPages = Math.max(1, Math.ceil(filteredEntries.length / itemsPerPage));
  // A filter change can leave the URL's page past the end of the new board.
  const currentPage = Math.min(requestedPage, totalPages - 1);

  const paginatedEntries = useMemo(
    () => filteredEntries.slice(currentPage * itemsPerPage, (currentPage + 1) * itemsPerPage),
    [filteredEntries, currentPage, itemsPerPage],
  );
  const handleItemsPerPageChange = (perPage: number) => {
    void setItemsPerPage(perPage);
    void setCurrentPage(0);
  };

  const handleSearchChange = (query: string) => {
    void setSearchQuery(query);
    void setCurrentPage(0);
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
      <PaginationStatus
        page={currentPage}
        totalPages={totalPages}
        total={filteredEntries.length}
        noun="player"
        query={deferredSearchQuery}
      />
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
            {/* The stat is picked in the scoreboard's toolbar; its column header flips the direction. */}
            <SortableHeader
              label={sortByLabel(sortBy)}
              sortKey={sortBy}
              activeSortKey={sortBy}
              sortDir={sortDirection}
              align="end"
              onSortChange={() => sort({ sortBy, sortDirection: flip() })}
            />
            {selectable && <TableHead className="w-28 text-center">{pickHeader}</TableHead>}
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
                    className="sm:max-w-72"
                  />
                </TableCell>
                {sortBy !== "matches" && (
                  <TableCell className="hidden text-end sm:table-cell">
                    {entry.matches.toLocaleString("en-US")}
                  </TableCell>
                )}
                <TableCell className="text-end">{renderValue(entry.value)}</TableCell>
                {selectable && (
                  <TableCell className="text-center">
                    {accountId != null && (
                      <PickToggle
                        name={profile?.personaname ?? `player ${accountId}`}
                        picked={selectedAccountIds.includes(accountId)}
                        full={selectedAccountIds.length >= maxSelected}
                        onClick={() => togglePick(accountId)}
                      />
                    )}
                  </TableCell>
                )}
              </TableRow>
            );
          })}
          {paginatedEntries.length === 0 && (
            <TableEmptyRow colSpan={(sortBy === "matches" ? 3 : 4) + (selectable ? 1 : 0)}>
              {/* The search only sees the players on this board, so "no results" is about the board, not the player. */}
              {deferredSearchQuery
                ? `No match in the top ${entries.length.toLocaleString("en-US")} players for this sort.`
                : undefined}
            </TableEmptyRow>
          )}
        </TableBody>
      </Table>
      {controls}
    </div>
  );
}
