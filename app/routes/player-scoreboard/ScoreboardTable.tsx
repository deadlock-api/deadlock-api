import { useQueries } from "@tanstack/react-query";
import type { PlayerEntry } from "deadlock_api_client";
import Fuse from "fuse.js";
import { useMemo, useState } from "react";
import { Skeleton } from "~/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { api } from "~/lib/api";
import { ScoreboardControls } from "./ScoreboardControls";
import { formatStatValue, getSortByLabel } from "./sort-options";

interface SteamProfileMap {
  [accountId: number]: { personaname: string; avatar: string; profileurl: string };
}

const STEAM_BATCH_SIZE = 500;

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

export interface ScoreboardTableProps {
  entries: PlayerEntry[];
  sortBy: string;
}

export function ScoreboardTable({
  entries,
  sortBy,
}: ScoreboardTableProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(0);
  const [itemsPerPage, setItemsPerPage] = useState(25);

  const steamAccountIds = useMemo(
    () => entries.map((e) => e.account_id).filter((id): id is number => id != null),
    [entries],
  );

  const batches = useMemo(() => chunk(steamAccountIds, STEAM_BATCH_SIZE), [steamAccountIds]);

  const steamProfileQueries = useQueries({
    queries: batches.map((batch) => ({
      queryKey: ["steamProfiles", batch],
      queryFn: async () => {
        const response = await api.steam_api.steam({ accountIds: batch });
        const map: SteamProfileMap = {};
        for (const profile of response.data) {
          map[profile.account_id] = {
            personaname: profile.personaname,
            avatar: profile.avatar,
            profileurl: profile.profileurl,
          };
        }
        return map;
      },
      enabled: batch.length > 0,
      staleTime: 24 * 60 * 60 * 1000,
    })),
  });

  const isLoadingProfiles = steamProfileQueries.some((q) => q.isLoading);

  const profiles = useMemo(() => {
    const merged: SteamProfileMap = {};
    for (const query of steamProfileQueries) {
      if (query.data) Object.assign(merged, query.data);
    }
    return merged;
  }, [steamProfileQueries]);

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
        threshold: 0.4,
      }),
    [enrichedEntries],
  );

  const filteredEntries = useMemo(
    () => (searchQuery ? fuse.search(searchQuery).map((r) => r.item) : enrichedEntries),
    [searchQuery, enrichedEntries, fuse],
  );

  const totalPages = Math.ceil(filteredEntries.length / itemsPerPage);
  const paginatedEntries = useMemo(
    () => filteredEntries.slice(currentPage * itemsPerPage, (currentPage + 1) * itemsPerPage),
    [filteredEntries, currentPage, itemsPerPage],
  );
  const hasNextPage = currentPage < totalPages - 1;

  const handleItemsPerPageChange = (perPage: number) => {
    setItemsPerPage(perPage);
    setCurrentPage(0);
  };

  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    setCurrentPage(0);
  };

  const controls = (
    <ScoreboardControls
      searchQuery={searchQuery}
      setSearchQuery={handleSearchChange}
      itemsPerPage={itemsPerPage}
      onItemsPerPageChange={handleItemsPerPageChange}
      currentPage={currentPage}
      onPageChange={setCurrentPage}
      hasNextPage={hasNextPage}
      totalEntries={filteredEntries.length}
    />
  );

  return (
    <div>
      {controls}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[5ch] text-right">#</TableHead>
            <TableHead>Player</TableHead>
            {sortBy !== "matches" && <TableHead className="text-right">Matches</TableHead>}
            <TableHead className="text-right">{getSortByLabel(sortBy)}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {paginatedEntries.map((entry, i) => {
            const accountId = entry.account_id;
            const profile = accountId != null ? profiles[accountId] : undefined;
            return (
              <TableRow key={`${accountId ?? i}-${entry.rank}`}>
                <TableCell className="text-right">{entry.rank + 1}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {isLoadingProfiles && !profile ? (
                      <>
                        <Skeleton className="h-6 w-6 rounded-full" />
                        <Skeleton className="h-4 w-24" />
                      </>
                    ) : (
                      <>
                        {profile?.avatar && (
                          <img src={profile.avatar} alt="" className="h-6 w-6 rounded-full" loading="lazy" />
                        )}
                        <span className="truncate max-w-[200px]">
                          {profile?.personaname ?? (accountId != null ? `Player ${accountId}` : `#${entry.rank}`)}
                        </span>
                      </>
                    )}
                    {accountId != null && <span className="text-xs text-muted-foreground">[{accountId}]</span>}
                  </div>
                </TableCell>
                {sortBy !== "matches" && <TableCell className="text-right">{entry.matches.toLocaleString()}</TableCell>}
                <TableCell className="text-right">{formatStatValue(entry.value, sortBy)}</TableCell>
              </TableRow>
            );
          })}
          {paginatedEntries.length === 0 && (
            <TableRow>
              <TableCell colSpan={sortBy === "matches" ? 3 : 4} className="text-center text-muted-foreground py-8">
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
