import { useQuery } from "@tanstack/react-query";
import type { PlayerEntry } from "deadlock_api_client";
import Fuse from "fuse.js";
import { useMemo, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { api } from "~/lib/api";
import { ScoreboardControls } from "./ScoreboardControls";
import { formatStatValue, getSortByLabel } from "./sort-options";

interface SteamProfileMap {
  [accountId: number]: { personaname: string; avatar: string; profileurl: string };
}

export interface ScoreboardTableProps {
  entries: PlayerEntry[];
  sortBy: string;
  currentPage: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
  onItemsPerPageChange: (perPage: number) => void;
}

export function ScoreboardTable({
  entries,
  sortBy,
  currentPage,
  itemsPerPage,
  onPageChange,
  onItemsPerPageChange,
}: ScoreboardTableProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const steamAccountIds = useMemo(
    () => entries.map((e) => e.account_id).filter((id): id is number => id != null),
    [entries],
  );

  const steamProfilesQuery = useQuery({
    queryKey: ["steamProfiles", steamAccountIds],
    queryFn: async () => {
      if (steamAccountIds.length === 0) return {} as SteamProfileMap;
      const response = await api.steam_api.steam({ accountIds: steamAccountIds });
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
    enabled: steamAccountIds.length > 0,
    staleTime: 24 * 60 * 60 * 1000,
  });

  const profiles = steamProfilesQuery.data ?? {};

  // Build enriched entries for search
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

  const hasNextPage = entries.length >= itemsPerPage;

  const controls = (
    <ScoreboardControls
      searchQuery={searchQuery}
      setSearchQuery={setSearchQuery}
      itemsPerPage={itemsPerPage}
      onItemsPerPageChange={onItemsPerPageChange}
      currentPage={currentPage}
      onPageChange={onPageChange}
      hasNextPage={hasNextPage}
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
            <TableHead className="text-right">Matches</TableHead>
            <TableHead className="text-right">{getSortByLabel(sortBy)}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredEntries.map((entry, i) => {
            const accountId = entry.account_id;
            const profile = accountId != null ? profiles[accountId] : undefined;
            return (
              <TableRow key={`${accountId ?? i}-${entry.rank}`}>
                <TableCell className="text-right">{entry.rank}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {profile?.avatar && (
                      <img src={profile.avatar} alt="" className="h-6 w-6 rounded-full" loading="lazy" />
                    )}
                    <span className="truncate max-w-[200px]">
                      {profile?.personaname ?? (accountId != null ? `Player ${accountId}` : `#${entry.rank}`)}
                    </span>
                    {accountId != null && <span className="text-xs text-muted-foreground">[{accountId}]</span>}
                  </div>
                </TableCell>
                <TableCell className="text-right">{entry.matches.toLocaleString()}</TableCell>
                <TableCell className="text-right">{formatStatValue(entry.value, sortBy)}</TableCell>
              </TableRow>
            );
          })}
          {filteredEntries.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
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
