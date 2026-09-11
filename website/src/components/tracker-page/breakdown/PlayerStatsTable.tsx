import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type {
  PlayerMatchHistoryEntry,
  PlayersApiEnemyStatsRequest,
  PlayersApiMateStatsRequest,
} from "deadlock_api_client";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useId, useMemo, useState } from "react";

import { LoadingLogo } from "~/components/LoadingLogo";
import { PaginationControls } from "~/components/PaginationControls";
import { Button } from "~/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader } from "~/components/ui/empty";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Skeleton } from "~/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { Tooltip, TooltipTrigger } from "~/components/ui/tooltip";
import { day } from "~/dayjs";
import { useSteamProfiles } from "~/hooks/useSteamProfiles";
import {
  type CompanionRow,
  type CompanionSort,
  intersectCompanionRows,
  sortCompanionRows,
} from "~/lib/tracker/companions";
import { cn } from "~/lib/utils";
import { trackerEnemyStatsQueryOptions, trackerMateStatsQueryOptions } from "~/queries/tracker-queries";

import { WIN_COLOR } from "../shared/colors";
import { PanelTooltipContent } from "../shared/PanelTooltipContent";

interface CompanionTableProps {
  rows: CompanionRow[] | undefined;
  isPending: boolean;
  isError: boolean;
  isFetching: boolean;
  onRetry: () => void;
  label: string;
  matchesLabel: string;
  winrateLabel: string;
}

function CompanionTable({
  rows,
  isPending,
  isError,
  isFetching,
  onRetry,
  label,
  matchesLabel,
  winrateLabel,
}: CompanionTableProps) {
  const minimumMatchesId = useId();
  const [minMatches, setMinMatches] = useState(2);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(0);
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
      const name = profiles[row.accountId]?.personaname;
      return name?.toLowerCase().includes(query) || String(row.accountId).includes(query);
    });
    return sortCompanionRows(matches, sortKey, sortDir);
  }, [eligibleRows, searchQuery, profiles, sortKey, sortDir]);

  if (isPending) {
    return (
      <div className="flex items-center justify-center py-16">
        <LoadingLogo />
      </div>
    );
  }

  if (isError && rows === undefined) {
    return (
      <Empty className="gap-3 border py-6 md:py-6">
        <EmptyHeader>
          <EmptyDescription>These stats couldn’t be loaded.</EmptyDescription>
        </EmptyHeader>
        <Button variant="outline" size="sm" disabled={isFetching} onClick={onRetry}>
          {isFetching ? "Retrying…" : "Retry"}
        </Button>
      </Empty>
    );
  }

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / itemsPerPage));
  const visiblePage = Math.min(currentPage, totalPages - 1);
  const paginatedRows = filteredRows.slice(visiblePage * itemsPerPage, (visiblePage + 1) * itemsPerPage);

  return (
    <div className="@container flex flex-col gap-3">
      {isError && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <output className="text-xs text-muted-foreground">Refresh failed. Showing saved results.</output>
          <Button variant="outline" size="xs" disabled={isFetching} onClick={onRetry}>
            {isFetching ? "Retrying…" : "Retry"}
          </Button>
        </div>
      )}
      <PaginationControls
        searchQuery={searchQuery}
        onSearchChange={(query) => {
          setSearchQuery(query);
          setCurrentPage(0);
        }}
        itemsPerPage={itemsPerPage}
        onItemsPerPageChange={(count) => {
          setItemsPerPage(count);
          setCurrentPage(0);
        }}
        currentPage={visiblePage}
        onPageChange={setCurrentPage}
        totalPages={totalPages}
        searchPlaceholder="Search player..."
      >
        <div className="flex items-center gap-2">
          <Label htmlFor={minimumMatchesId} className="text-xs text-muted-foreground">
            Min matches
          </Label>
          <Input
            id={minimumMatchesId}
            type="number"
            min={1}
            value={minMatches}
            onChange={(e) => {
              setMinMatches(Math.max(1, Number(e.target.value) || 1));
              setCurrentPage(0);
            }}
            className="h-8 w-20"
          />
        </div>
      </PaginationControls>
      <Table aria-label={label}>
        <TableHeader className="bg-muted">
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
              <TableHead
                key={column.key}
                className={cn("text-right", column.className)}
                title={column.key === "matches" ? matchesLabel : undefined}
                aria-sort={sortKey === column.key ? (sortDir === "desc" ? "descending" : "ascending") : "none"}
              >
                <button
                  type="button"
                  aria-label={`Sort by ${column.label.toLowerCase()}, ${sortKey === column.key && sortDir === "desc" ? "ascending" : "descending"}`}
                  className="inline-flex items-center gap-1 rounded-sm hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                  onClick={() => {
                    setSortDir(sortKey === column.key && sortDir === "desc" ? "asc" : "desc");
                    setSortKey(column.key);
                    setCurrentPage(0);
                  }}
                >
                  {column.label}
                  {sortKey === column.key &&
                    (sortDir === "desc" ? (
                      <ArrowDown aria-hidden="true" className="size-3" />
                    ) : (
                      <ArrowUp aria-hidden="true" className="size-3" />
                    ))}
                </button>
              </TableHead>
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
                  <div className="flex items-center gap-2">
                    {isLoadingProfiles && !profile ? (
                      <>
                        <Skeleton className="size-6 rounded-full" />
                        <Skeleton className="h-4 w-24" />
                      </>
                    ) : (
                      <>
                        {profile?.avatar && (
                          <img src={profile.avatar} alt="" className="size-6 shrink-0 rounded-full" loading="lazy" />
                        )}
                        <Link
                          to="/players/$accountId"
                          params={{ accountId: String(row.accountId) }}
                          className="truncate hover:text-primary hover:underline"
                          title="Open player tracker"
                        >
                          {profile?.personaname ?? `Player ${row.accountId}`}
                        </Link>
                      </>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums">{row.matches.toLocaleString("en-US")}</TableCell>
                <TableCell className="hidden text-right tabular-nums @md:table-cell">
                  {row.wins.toLocaleString("en-US")}
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-2">
                    <span className="tabular-nums">{(winrate * 100).toFixed(1)}%</span>
                    <div className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-muted @md:block">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${winrate * 100}%`, backgroundColor: WIN_COLOR }}
                      />
                    </div>
                  </div>
                </TableCell>
                <TableCell className="hidden text-right whitespace-nowrap text-muted-foreground @lg:table-cell">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>{day.unix(row.lastPlayedUnix).fromNow()}</span>
                    </TooltipTrigger>
                    <PanelTooltipContent>
                      {day.unix(row.lastPlayedUnix).format("MMM D, YYYY HH:mm")}
                    </PanelTooltipContent>
                  </Tooltip>
                </TableCell>
              </TableRow>
            );
          })}
          {paginatedRows.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                No players found
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

interface BreakdownTabProps {
  accountId: number;
  gameMode: string;
  minUnixTimestamp?: number | null;
  maxUnixTimestamp?: number | null;
  /** The filter-bar-scoped match history; companion stats are intersected with it so every filter applies. */
  entries: PlayerMatchHistoryEntry[];
}

export function MatesTab({ accountId, gameMode, minUnixTimestamp, maxUnixTimestamp, entries }: BreakdownTabProps) {
  const params = useMemo(
    (): PlayersApiMateStatsRequest => ({
      accountId,
      gameMode: gameMode as PlayersApiMateStatsRequest["gameMode"],
      minUnixTimestamp: minUnixTimestamp ?? undefined,
      maxUnixTimestamp: maxUnixTimestamp ?? undefined,
    }),
    [accountId, gameMode, minUnixTimestamp, maxUnixTimestamp],
  );
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
      rows={rows}
      isPending={query.isPending}
      isError={query.isError}
      isFetching={query.isFetching}
      onRetry={() => void query.refetch()}
      label="Detailed teammate stats"
      matchesLabel="Matches together"
      winrateLabel="Win rate"
    />
  );
}

export function EnemiesTab({ accountId, gameMode, minUnixTimestamp, maxUnixTimestamp, entries }: BreakdownTabProps) {
  const params = useMemo(
    (): PlayersApiEnemyStatsRequest => ({
      accountId,
      gameMode: gameMode as PlayersApiEnemyStatsRequest["gameMode"],
      minUnixTimestamp: minUnixTimestamp ?? undefined,
      maxUnixTimestamp: maxUnixTimestamp ?? undefined,
    }),
    [accountId, gameMode, minUnixTimestamp, maxUnixTimestamp],
  );
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
      rows={rows}
      isPending={query.isPending}
      isError={query.isError}
      isFetching={query.isFetching}
      onRetry={() => void query.refetch()}
      label="Detailed opponent stats"
      matchesLabel="Matches against"
      winrateLabel="Win rate"
    />
  );
}
