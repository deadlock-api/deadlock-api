import { useQuery } from "@tanstack/react-query";
import type { PlayerMatchHistoryEntry } from "deadlock_api_client";
import { useId, useMemo, useState } from "react";

import { PlayerCell } from "~/components/domain/player/PlayerCell";
import { useTrackerTime } from "~/components/features/tracker/shared/useTrackerTime";
import { PaginationControls, PaginationStatus } from "~/components/patterns/data-table/PaginationControls";
import { SortableHeader } from "~/components/patterns/data-table/SortableHeader";
import { TableEmptyRow } from "~/components/patterns/data-table/TableEmptyRow";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { Button } from "~/components/ui/button";
import { Field } from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import { ProgressBar } from "~/components/ui/progress-bar";
import { SearchInput } from "~/components/ui/search-input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { Tooltip } from "~/components/ui/tooltip";
import { useSteamProfiles } from "~/hooks/useSteamProfiles";
import { MODE_CONFIG } from "~/lib/game-mode";
import {
  type CompanionRow,
  type CompanionSort,
  intersectCompanionRows,
  sortCompanionRows,
} from "~/lib/tracker/companions";
import type { TrackerFilterValues } from "~/lib/tracker/compute";
import { trackerEnemyStatsQueryOptions, trackerMateStatsQueryOptions } from "~/queries/tracker-queries";

import { CompanionMatchesDialog } from "./CompanionMatchesDialog";

interface CompanionTableProps {
  paginationKey: string;
  rows: CompanionRow[] | undefined;
  isPending: boolean;
  isError: boolean;
  isFetching: boolean;
  onRetry: () => void;
  label: string;
  matchesLabel: string;
  winrateLabel: string;
  relation: "with" | "against";
  entries: PlayerMatchHistoryEntry[];
  onOpenMatch: (matchId: number) => void;
}

function CompanionTable({
  paginationKey,
  rows,
  isPending,
  isError,
  isFetching,
  onRetry,
  label,
  matchesLabel,
  winrateLabel,
  relation,
  entries,
  onOpenMatch,
}: CompanionTableProps) {
  const minimumMatchesId = useId();
  const { toTime, fromNow } = useTrackerTime();
  const [minMatches, setMinMatches] = useState(2);
  const [searchQuery, setSearchQuery] = useState("");
  const [pagination, setPagination] = useState({ key: paginationKey, page: 0 });
  // A different filter scope starts at the top; refreshing the same scope preserves the page.
  if (pagination.key !== paginationKey) setPagination({ key: paginationKey, page: 0 });
  const currentPage = pagination.key === paginationKey ? pagination.page : 0;
  const setCurrentPage = (page: number) => setPagination({ key: paginationKey, page });
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [sortKey, setSortKey] = useState<CompanionSort>("matches");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const eligibleRows = useMemo(() => (rows ?? []).filter((row) => row.matches >= minMatches), [rows, minMatches]);

  const accountIds = useMemo(() => eligibleRows.map((row) => row.accountId), [eligibleRows]);
  const { profiles, isLoading: isLoadingProfiles } = useSteamProfiles(accountIds);

  const filteredRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const matches = eligibleRows.filter((row) => {
      if (!query) return true;
      const name = profiles[row.accountId]?.personaname ?? `Player ${row.accountId}`;
      return name.toLowerCase().includes(query) || String(row.accountId).includes(query);
    });
    return sortCompanionRows(matches, sortKey, sortDir);
  }, [eligibleRows, searchQuery, profiles, sortKey, sortDir]);

  if (isPending) {
    return <LoadingState label={label.toLowerCase()} align="center" />;
  }

  if (isError && rows === undefined) {
    return <ErrorState title="These stats couldn’t be loaded." onRetry={onRetry} retrying={isFetching} />;
  }

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / itemsPerPage));
  const visiblePage = Math.min(currentPage, totalPages - 1);
  const paginatedRows = filteredRows.slice(visiblePage * itemsPerPage, (visiblePage + 1) * itemsPerPage);

  return (
    <div className="@container flex flex-col gap-3">
      {isError && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <output className="text-xs text-muted-foreground">Refresh failed. Showing loaded results.</output>
          <Button variant="outline" size="xs" disabled={isFetching} onClick={onRetry}>
            {isFetching ? "Retrying…" : "Retry"}
          </Button>
        </div>
      )}
      <PaginationControls
        size="sm"
        page={visiblePage}
        onPageChange={setCurrentPage}
        pageSize={itemsPerPage}
        onPageSizeChange={(count) => {
          setItemsPerPage(count);
          setCurrentPage(0);
        }}
        totalPages={totalPages}
      >
        <SearchInput
          size="sm"
          placeholder="Search player..."
          aria-label="Search player"
          value={searchQuery}
          onValueChange={(query) => {
            setSearchQuery(query);
            setCurrentPage(0);
          }}
        />
        <Field orientation="horizontal" label="Min matches" htmlFor={minimumMatchesId}>
          <Input
            id={minimumMatchesId}
            type="number"
            size="sm"
            min={1}
            value={minMatches}
            onChange={(e) => {
              setMinMatches(Math.max(1, Number(e.target.value) || 1));
              setCurrentPage(0);
            }}
            className="w-20"
          />
        </Field>
      </PaginationControls>
      <PaginationStatus
        page={visiblePage}
        totalPages={totalPages}
        total={filteredRows.length}
        noun="player"
        query={searchQuery}
      />
      <Table density="compact" aria-label={label}>
        <TableHeader tone="muted">
          <TableRow>
            <TableHead>Player</TableHead>
            {(
              [
                { key: "matches", label: "Games" },
                { key: "wins", label: "Wins", className: "hidden @md:table-cell" },
                { key: "winrate", label: winrateLabel },
                { key: "lastPlayedUnix", label: "Last played", className: "hidden @lg:table-cell" },
              ] satisfies { key: CompanionSort; label: string; className?: string }[]
            ).map((column) => (
              <SortableHeader
                key={column.key}
                label={column.label}
                sortKey={column.key}
                activeSortKey={sortKey}
                sortDir={sortDir}
                align="end"
                className={column.className}
                title={column.key === "matches" ? matchesLabel : undefined}
                sortLabel={`Sort by ${column.label.toLowerCase()}, ${sortKey === column.key && sortDir === "desc" ? "ascending" : "descending"}`}
                onSortChange={(key) => {
                  setSortDir(sortKey === key && sortDir === "desc" ? "asc" : "desc");
                  setSortKey(key);
                  setCurrentPage(0);
                }}
              />
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {paginatedRows.map((row) => {
            const profile = profiles[row.accountId];
            const winrate = row.matches > 0 ? row.wins / row.matches : 0;
            return (
              <TableRow key={row.accountId}>
                <TableCell className="w-full max-w-0">
                  <PlayerCell
                    accountId={row.accountId}
                    name={profile?.personaname}
                    avatar={profile?.avatar}
                    loading={isLoadingProfiles && !profile}
                    linkToDetail
                  />
                </TableCell>
                <TableCell className="text-end tabular-nums">
                  <CompanionMatchesDialog
                    row={row}
                    name={profile?.personaname ?? `Player ${row.accountId}`}
                    relation={relation}
                    entries={entries}
                    onOpenMatch={onOpenMatch}
                  />
                </TableCell>
                <TableCell className="hidden text-end tabular-nums @md:table-cell">
                  {row.wins.toLocaleString("en-US")}
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-2">
                    <span className="tabular-nums">{(winrate * 100).toFixed(1)}%</span>
                    <ProgressBar variant="thin" value={winrate} className="hidden w-16 @md:block" />
                  </div>
                </TableCell>
                <TableCell className="hidden text-end whitespace-nowrap text-muted-foreground @lg:table-cell">
                  <Tooltip content={toTime(row.lastPlayedUnix).format("MMM D, YYYY HH:mm")}>
                    <span>{fromNow(row.lastPlayedUnix)}</span>
                  </Tooltip>
                </TableCell>
              </TableRow>
            );
          })}
          {paginatedRows.length === 0 && <TableEmptyRow colSpan={5}>No players found</TableEmptyRow>}
        </TableBody>
      </Table>
    </div>
  );
}

interface BreakdownTabProps {
  accountId: number;
  filters: TrackerFilterValues;
  /** The filter-bar-scoped match history; companion stats are intersected with it so every filter applies. */
  entries: PlayerMatchHistoryEntry[];
  onOpenMatch: (matchId: number) => void;
}

export function MatesTab({ accountId, filters, entries, onOpenMatch }: BreakdownTabProps) {
  const params = {
    accountId,
    gameMode: MODE_CONFIG[filters.mode].gameMode,
    minUnixTimestamp: filters.minUnixTimestamp ?? undefined,
    maxUnixTimestamp: filters.maxUnixTimestamp ?? undefined,
  };
  const query = useQuery(trackerMateStatsQueryOptions(params));
  const rows = useMemo(
    () =>
      intersectCompanionRows(
        query.data
          ?.filter((mate) => mate.mate_id !== accountId)
          .map((mate) => ({ id: mate.mate_id, matches: mate.matches })),
        entries,
      ),
    [query.data, accountId, entries],
  );
  return (
    <CompanionTable
      paginationKey={JSON.stringify([accountId, filters])}
      rows={rows}
      isPending={query.isPending}
      isError={query.isError}
      isFetching={query.isFetching}
      onRetry={() => void query.refetch()}
      label="Detailed teammate stats"
      matchesLabel="Matches together"
      winrateLabel="Win rate"
      relation="with"
      entries={entries}
      onOpenMatch={onOpenMatch}
    />
  );
}

export function EnemiesTab({ accountId, filters, entries, onOpenMatch }: BreakdownTabProps) {
  const params = {
    accountId,
    gameMode: MODE_CONFIG[filters.mode].gameMode,
    minUnixTimestamp: filters.minUnixTimestamp ?? undefined,
    maxUnixTimestamp: filters.maxUnixTimestamp ?? undefined,
  };
  const query = useQuery(trackerEnemyStatsQueryOptions(params));
  const rows = useMemo(
    () =>
      intersectCompanionRows(
        query.data?.map((enemy) => ({ id: enemy.enemy_id, matches: enemy.matches })),
        entries,
      ),
    [query.data, entries],
  );
  return (
    <CompanionTable
      paginationKey={JSON.stringify([accountId, filters])}
      rows={rows}
      isPending={query.isPending}
      isError={query.isError}
      isFetching={query.isFetching}
      onRetry={() => void query.refetch()}
      label="Detailed opponent stats"
      matchesLabel="Matches against"
      winrateLabel="Win rate"
      relation="against"
      entries={entries}
      onOpenMatch={onOpenMatch}
    />
  );
}
