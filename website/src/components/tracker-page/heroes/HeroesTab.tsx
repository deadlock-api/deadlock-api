import { useQuery } from "@tanstack/react-query";
import type { AnalyticsApiHeroStatsRequest, HeroStats, PlayersApiPlayerHeroStatsRequest } from "deadlock_api_client";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useMemo, useState } from "react";

import { HeroImage } from "~/components/HeroImage";
import { HeroName } from "~/components/HeroName";
import { LoadingLogo } from "~/components/LoadingLogo";
import { QueryRenderer } from "~/components/QueryRenderer";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { day } from "~/dayjs";
import { extractBadgeMap } from "~/lib/leaderboard";
import { cn } from "~/lib/utils";
import { heroStatsQueryOptions } from "~/queries/hero-stats-query";
import { ranksQueryOptions } from "~/queries/ranks-query";
import { trackerHeroStatsQueryOptions, trackerRankQueryOptions } from "~/queries/tracker-queries";

import { LOSS_TEXT_CLASS, WIN_COLOR, WIN_TEXT_CLASS } from "../shared/colors";

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

interface HeroAverage {
  winrate: number;
  kda: number;
}

function DeltaBadge({
  value,
  digits,
  suffix = "",
  averageLabel,
}: {
  value: number;
  digits: number;
  suffix?: string;
  averageLabel: string;
}) {
  if (Math.abs(value) < 0.5 * 10 ** -digits) return null;
  return (
    <span
      className={cn("hidden text-xs tabular-nums @lg:inline", value > 0 ? WIN_TEXT_CLASS : LOSS_TEXT_CLASS)}
      title={averageLabel}
    >
      {value > 0 ? "+" : "−"}
      {Math.abs(value).toFixed(digits)}
      {suffix}
    </span>
  );
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
  onSelectHero,
}: {
  accountId: number;
  gameMode: string;
  matchMode: string;
  heroId: number | null;
  minUnixTimestamp?: number | null;
  maxUnixTimestamp?: number | null;
  onSelectHero: (heroId: number) => void;
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

  const { data: rank } = useQuery(trackerRankQueryOptions(accountId));
  const { data: ranks = [] } = useQuery(ranksQueryOptions);
  const badge = rank != null && rank.badge > 0 ? rank.badge : null;
  const tier = badge != null ? Math.floor(badge / 10) : null;
  const tierName = badge != null ? extractBadgeMap(ranks).get(badge)?.name : undefined;

  const averageParams = useMemo(
    (): AnalyticsApiHeroStatsRequest => ({
      gameMode: gameMode as AnalyticsApiHeroStatsRequest["gameMode"],
      matchMode,
      minUnixTimestamp: minUnixTimestamp ?? undefined,
      maxUnixTimestamp: maxUnixTimestamp ?? undefined,
      minAverageBadge: tier != null ? tier * 10 + 1 : undefined,
      maxAverageBadge: tier != null ? tier * 10 + 6 : undefined,
      minHeroMatches: 0,
      minHeroMatchesTotal: 0,
    }),
    [gameMode, matchMode, minUnixTimestamp, maxUnixTimestamp, tier],
  );
  const { data: averages } = useQuery({
    ...heroStatsQueryOptions(averageParams),
    select: (stats) =>
      new Map<number, HeroAverage>(
        stats
          .filter((stat) => stat.matches > 0)
          .map((stat) => [
            stat.hero_id,
            {
              winrate: stat.wins / stat.matches,
              kda:
                stat.total_deaths > 0
                  ? (stat.total_kills + stat.total_assists) / stat.total_deaths
                  : stat.total_kills + stat.total_assists,
            },
          ]),
      ),
  });
  const bracketLabel = tierName ? `${tierName} players` : "all players";

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
                  <TableRow
                    key={row.heroId}
                    className="cursor-pointer"
                    onClick={() => onSelectHero(row.heroId)}
                    title="Show matches on this hero"
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <HeroImage heroId={row.heroId} className="size-7 rounded-full" />
                        <HeroName heroId={row.heroId} className="max-w-[80px] @md:max-w-[120px]" />
                      </div>
                    </TableCell>
                    {COLUMNS.map((column) => {
                      const average = averages?.get(row.heroId);
                      return (
                        <TableCell key={column.key} className={cn("text-right tabular-nums", column.className)}>
                          {column.key === "winrate" ? (
                            <div className="flex items-center justify-end gap-2">
                              {average && (
                                <DeltaBadge
                                  value={(row.winrate - average.winrate) * 100}
                                  digits={1}
                                  suffix="%"
                                  averageLabel={`${bracketLabel} average: ${(average.winrate * 100).toFixed(1)}%`}
                                />
                              )}
                              <span>{column.format(row)}</span>
                              <div className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-muted @md:block">
                                <div
                                  className="h-full rounded-full"
                                  style={{ width: `${Math.round(row.winrate * 100)}%`, backgroundColor: WIN_COLOR }}
                                />
                              </div>
                            </div>
                          ) : column.key === "kda" ? (
                            <div className="flex items-center justify-end gap-2">
                              {average && (
                                <DeltaBadge
                                  value={row.kda - average.kda}
                                  digits={2}
                                  averageLabel={`${bracketLabel} average: ${average.kda.toFixed(2)}`}
                                />
                              )}
                              <span>{column.format(row)}</span>
                            </div>
                          ) : (
                            column.format(row)
                          )}
                        </TableCell>
                      );
                    })}
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
            {averages && rows.length > 0 && (
              <p className="mt-2 hidden text-xs text-muted-foreground @lg:block">
                Win rate and KDA deltas compare against {bracketLabel} on the same hero in the selected range.
              </p>
            )}
          </div>
        );
      }}
    </QueryRenderer>
  );
}
