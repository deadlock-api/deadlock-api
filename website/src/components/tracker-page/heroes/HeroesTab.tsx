import { useQuery } from "@tanstack/react-query";
import type { HeroStats, PlayersApiPlayerHeroStatsRequest } from "deadlock_api_client";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useMemo, useState } from "react";

import { HeroImage } from "~/components/HeroImage";
import { HeroName } from "~/components/HeroName";
import { LoadingLogo } from "~/components/LoadingLogo";
import { QueryRenderer } from "~/components/QueryRenderer";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { day } from "~/dayjs";
import { cn } from "~/lib/utils";
import { trackerHeroStatsQueryOptions } from "~/queries/tracker-queries";

interface HeroRow {
  heroId: number;
  matches: number;
  winrate: number;
  kda: number;
  kills: number;
  deaths: number;
  assists: number;
  soulsPerMin: number;
  dmgPerMin: number;
  lastHitsPerMin: number;
  lastPlayed: number;
}

function toRow(stats: HeroStats): HeroRow {
  const matches = stats.matches_played;
  return {
    heroId: stats.hero_id,
    matches,
    winrate: matches > 0 ? stats.wins / matches : 0,
    kda: stats.deaths > 0 ? (stats.kills + stats.assists) / stats.deaths : stats.kills + stats.assists,
    kills: matches > 0 ? stats.kills / matches : 0,
    deaths: matches > 0 ? stats.deaths / matches : 0,
    assists: matches > 0 ? stats.assists / matches : 0,
    soulsPerMin: stats.networth_per_min,
    dmgPerMin: stats.damage_per_min,
    lastHitsPerMin: stats.last_hits_per_min,
    lastPlayed: stats.last_played,
  };
}

/** `className` hides a column until the table's container is wide enough for it. */
const COLUMNS: {
  key: keyof Omit<HeroRow, "heroId">;
  label: string;
  format: (row: HeroRow) => string;
  className?: string;
}[] = [
  { key: "matches", label: "Matches", format: (row) => row.matches.toLocaleString("en-US") },
  { key: "winrate", label: "Win rate", format: (row) => `${(row.winrate * 100).toFixed(1)}%` },
  { key: "kda", label: "KDA", format: (row) => row.kda.toFixed(2) },
  { key: "kills", label: "Kills", format: (row) => row.kills.toFixed(1), className: "hidden @3xl:table-cell" },
  { key: "deaths", label: "Deaths", format: (row) => row.deaths.toFixed(1), className: "hidden @3xl:table-cell" },
  { key: "assists", label: "Assists", format: (row) => row.assists.toFixed(1), className: "hidden @3xl:table-cell" },
  {
    key: "soulsPerMin",
    label: "Souls/min",
    format: (row) => Math.round(row.soulsPerMin).toLocaleString("en-US"),
    className: "hidden @lg:table-cell",
  },
  {
    key: "dmgPerMin",
    label: "Dmg/min",
    format: (row) => Math.round(row.dmgPerMin).toLocaleString("en-US"),
    className: "hidden @2xl:table-cell",
  },
  {
    key: "lastHitsPerMin",
    label: "LH/min",
    format: (row) => row.lastHitsPerMin.toFixed(1),
    className: "hidden @2xl:table-cell",
  },
  {
    key: "lastPlayed",
    label: "Last played",
    format: (row) => day.unix(row.lastPlayed).fromNow(),
    className: "hidden @xl:table-cell",
  },
];

export function HeroesTab({
  accountId,
  gameMode,
  matchMode,
  heroId,
  minUnixTimestamp,
  maxUnixTimestamp,
}: {
  accountId: number;
  gameMode: string;
  matchMode: string;
  heroId: number | null;
  minUnixTimestamp?: number | null;
  maxUnixTimestamp?: number | null;
}) {
  const [sortKey, setSortKey] = useState<keyof Omit<HeroRow, "heroId">>("matches");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");

  const params = useMemo(
    (): PlayersApiPlayerHeroStatsRequest => ({
      accountIds: [accountId],
      gameMode: gameMode as PlayersApiPlayerHeroStatsRequest["gameMode"],
      matchMode,
      heroIds: heroId != null ? String(heroId) : undefined,
      minUnixTimestamp: minUnixTimestamp ?? undefined,
      maxUnixTimestamp: maxUnixTimestamp ?? undefined,
    }),
    [accountId, gameMode, matchMode, heroId, minUnixTimestamp, maxUnixTimestamp],
  );

  const query = useQuery(trackerHeroStatsQueryOptions(params));

  const handleSort = (key: keyof Omit<HeroRow, "heroId">) => {
    if (sortKey === key) {
      setSortDir(sortDir === "desc" ? "asc" : "desc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  return (
    <QueryRenderer
      query={query}
      loadingFallback={
        <div className="flex items-center justify-center py-16">
          <LoadingLogo />
        </div>
      }
    >
      {(data) => {
        const rows = data
          .map(toRow)
          .sort((a, b) => (sortDir === "desc" ? b[sortKey] - a[sortKey] : a[sortKey] - b[sortKey]));
        return (
          <div className="@container">
            <Table>
              <TableHeader className="bg-muted">
                <TableRow>
                  <TableHead>Hero</TableHead>
                  {COLUMNS.map((column) => (
                    <TableHead key={column.key} className={cn("text-right", column.className)}>
                      <button
                        type="button"
                        onClick={() => handleSort(column.key)}
                        className="inline-flex cursor-pointer items-center gap-1 transition-colors hover:text-foreground"
                      >
                        {column.label}
                        {sortKey === column.key &&
                          (sortDir === "desc" ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />)}
                      </button>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.heroId}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <HeroImage heroId={row.heroId} className="size-7 rounded-full" />
                        <HeroName heroId={row.heroId} className="max-w-[80px] @md:max-w-[120px]" />
                      </div>
                    </TableCell>
                    {COLUMNS.map((column) => (
                      <TableCell key={column.key} className={cn("text-right tabular-nums", column.className)}>
                        {column.format(row)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={COLUMNS.length + 1} className="py-8 text-center text-muted-foreground">
                      No hero stats in the selected range
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        );
      }}
    </QueryRenderer>
  );
}
