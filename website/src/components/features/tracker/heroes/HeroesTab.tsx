import { useQuery } from "@tanstack/react-query";
import type {
  AnalyticsApiHeroStatsRequest,
  PlayerMatchHistoryEntry,
  PlayersApiPlayerHeroStatsRequest,
} from "deadlock_api_client";
import { useId, useMemo, useState } from "react";

import { HeroImage } from "~/components/domain/assets/HeroImage";
import { HeroName } from "~/components/domain/assets/HeroName";
import { FormDots } from "~/components/domain/match/FormDots";
import { TrackerQueryPaused } from "~/components/features/tracker/shared/TrackerQueryPaused";
import { TableEmptyRow } from "~/components/patterns/data-table/TableEmptyRow";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { QueryRenderer } from "~/components/patterns/states/QueryRenderer";
import { Button } from "~/components/ui/button";
import { RateBar } from "~/components/ui/rate-bar";
import { ariaSort, SortButton } from "~/components/ui/sort-button";
import { SwitchField } from "~/components/ui/switch-field";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { day } from "~/dayjs";
import { benchmarkRankRange } from "~/lib/tracker/benchmarks";
import { recentFormByHero, type ResultFilter } from "~/lib/tracker/compute";
import { type HeroRow, type HeroSortKey, sortHeroRows, toHeroRow } from "~/lib/tracker/hero-performance";
import { cn } from "~/lib/utils";
import { heroStatsQueryOptions } from "~/queries/hero-stats-query";
import { ranksQueryOptions } from "~/queries/ranks-query";
import { trackerHeroStatsQueryOptions, trackerRankQueryOptions } from "~/queries/tracker-queries";

import { HeroComparison } from "./HeroComparison";

const FORM_LENGTH = 10;

interface HeroAverage {
  winrate: number;
  kda: number;
}

/** `className` hides a column until the table's container is wide enough for it. */
const COLUMNS: {
  key: HeroSortKey;
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
  { key: "recentWinrate", label: "Form", format: () => "", className: "hidden @lg:table-cell" },
  {
    key: "lastPlayed",
    label: "Last played",
    format: (row) => day.unix(row.lastPlayed).fromNow(),
    className: "hidden @xl:table-cell",
  },
];

/** Keep keyboard focus clear of the frozen hero column in the scrollable view. */
function revealTableButton(button: HTMLButtonElement) {
  const table = button.closest("table");
  const scroller = table?.parentElement;
  const heroHeader = table?.querySelector("th");
  if (!scroller || !heroHeader) return;
  if (button.closest("tr")?.firstElementChild?.contains(button)) return;

  const bounds = button.getBoundingClientRect();
  const left = heroHeader.getBoundingClientRect().right + 4;
  const right = scroller.getBoundingClientRect().right - 4;
  if (bounds.left < left) scroller.scrollLeft -= left - bounds.left;
  else if (bounds.right > right) scroller.scrollLeft += bounds.right - right;
}

export function HeroesTab({
  accountId,
  gameMode,
  matchMode,
  heroId,
  minUnixTimestamp,
  maxUnixTimestamp,
  entries,
  result = "all",
  onSelectHero,
  minimumMatches = 0,
  initialSortKey = "matches",
  initialSortDir = "desc",
}: {
  accountId: number;
  gameMode: string;
  matchMode: string;
  heroId: number | null;
  minUnixTimestamp?: number | null;
  maxUnixTimestamp?: number | null;
  /** Match history under the same filters, newest first; feeds the per-hero form column. */
  entries: PlayerMatchHistoryEntry[];
  /** Detailed API aggregates include both outcomes; disclose this when the match list is filtered. */
  result?: ResultFilter;
  onSelectHero: (heroId: number) => void;
  minimumMatches?: number;
  /** Start with the overview preview's ordering when opened in a dialog. */
  initialSortKey?: HeroSortKey;
  initialSortDir?: "desc" | "asc";
}) {
  const [sortKey, setSortKey] = useState(initialSortKey);
  const [sortDir, setSortDir] = useState(initialSortDir);
  const [showAllStats, setShowAllStats] = useState(false);
  const allStatsId = useId();
  const sortColumn = COLUMNS.find((column) => column.key === sortKey);

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
  const formByHero = useMemo(() => recentFormByHero(entries, FORM_LENGTH), [entries]);

  const rankQuery = useQuery(trackerRankQueryOptions(accountId));
  const rank = rankQuery.data;
  // A successful unranked lookup can compare all players; an unavailable rank cannot choose a cohort.
  const needsRank = gameMode === "normal";
  const rankReady = !needsRank || rank !== undefined;
  const { data: ranks = [] } = useQuery(ranksQueryOptions);
  const rankRange = useMemo(
    () => (gameMode === "normal" ? benchmarkRankRange(rank?.badge) : null),
    [gameMode, rank?.badge],
  );
  const tierName = ranks.find((rank) => rank.tier === rankRange?.tier)?.name;

  const averageParams = useMemo(
    (): AnalyticsApiHeroStatsRequest => ({
      gameMode: gameMode as AnalyticsApiHeroStatsRequest["gameMode"],
      matchMode,
      minUnixTimestamp: minUnixTimestamp ?? undefined,
      maxUnixTimestamp: maxUnixTimestamp ?? undefined,
      minAverageBadge: rankRange?.min,
      maxAverageBadge: rankRange?.max,
      minHeroMatches: 0,
      minHeroMatchesTotal: 0,
    }),
    [gameMode, matchMode, minUnixTimestamp, maxUnixTimestamp, rankRange],
  );
  const averagesQuery = useQuery({
    ...heroStatsQueryOptions(averageParams),
    enabled: rankReady,
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
  const averages = rankReady ? averagesQuery.data : undefined;
  const bracketLabel = rankRange ? `${tierName ?? `Tier ${rankRange.tier}`} players` : "all players";

  const handleSort = (key: HeroSortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "desc" ? "asc" : "desc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {result !== "all" && (
        <p className="text-xs text-muted-foreground">
          Detailed hero stats include both wins and losses. Hero, mode and date filters still apply.
        </p>
      )}
      {query.fetchStatus === "paused" ? (
        <TrackerQueryPaused
          description={
            query.data
              ? "Showing your last loaded hero stats. They will refresh when you're back online."
              : "Hero stats will load automatically when you're back online."
          }
        />
      ) : query.isError ? (
        <ErrorState
          title={query.data ? "Could not refresh hero stats" : "Could not load hero stats"}
          description={
            query.data
              ? "Showing your last loaded hero stats. Try again to refresh them."
              : "Your hero stats are temporarily unavailable. Try loading them again."
          }
          onRetry={() => query.refetch()}
          retrying={query.isFetching}
        />
      ) : null}
      <QueryRenderer
        query={query}
        keepDataOnError
        errorFallback={() => null}
        loadingFallback={query.fetchStatus === "paused" ? null : <LoadingState label="hero stats" align="center" />}
      >
        {(data) => {
          const rows = sortHeroRows(
            data
              .filter((stats) => stats.matches_played >= minimumMatches)
              .map((stats) => toHeroRow(stats, formByHero.get(stats.hero_id))),
            sortKey,
            sortDir,
          );
          return (
            <div className="@container flex flex-col gap-2">
              {rows.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-2 @3xl:hidden">
                  <SwitchField
                    id={allStatsId}
                    label="All stats"
                    checked={showAllStats}
                    onCheckedChange={setShowAllStats}
                  />
                  {showAllStats ? (
                    <span className="text-xs text-muted-foreground">Scroll for more columns →</span>
                  ) : sortColumn?.className ? (
                    <span className="text-xs text-muted-foreground">
                      Sorted by {sortColumn.label} {sortDir === "desc" ? "↓" : "↑"}
                    </span>
                  ) : null}
                </div>
              )}
              <Table
                aria-label="Detailed hero performance"
                density="compact"
                className={cn("text-xs @sm:text-sm", showAllStats && "min-w-max")}
                onFocusCapture={(event) => {
                  if (showAllStats && event.target instanceof HTMLButtonElement) revealTableButton(event.target);
                }}
              >
                <TableHeader tone="muted">
                  <TableRow>
                    <TableHead data-pinned={showAllStats ? "" : undefined}>Hero</TableHead>
                    {COLUMNS.map((column) => (
                      <TableHead
                        key={column.key}
                        className={cn("text-end", !showAllStats && column.className)}
                        aria-sort={ariaSort(sortKey === column.key, sortDir)}
                      >
                        <SortButton
                          active={sortKey === column.key}
                          sortDir={sortDir}
                          align="end"
                          aria-label={`Sort by ${column.label.toLowerCase()}, ${sortKey === column.key && sortDir === "desc" ? "ascending" : "descending"}`}
                          onClick={() => handleSort(column.key)}
                        >
                          {column.label}
                        </SortButton>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow
                      key={row.heroId}
                      data-interactive=""
                      onClick={() => onSelectHero(row.heroId)}
                      title="Show matches on this hero"
                    >
                      <TableCell data-pinned={showAllStats ? "" : undefined}>
                        <div className="flex items-center gap-1 @sm:gap-2">
                          <HeroImage heroId={row.heroId} shape="circle" className="size-6 @sm:size-7" />
                          <Button
                            variant="link"
                            size="inline"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectHero(row.heroId);
                            }}
                            className="text-foreground"
                          >
                            <HeroName heroId={row.heroId} className="max-w-18 @sm:max-w-20 @md:max-w-30" />
                          </Button>
                        </div>
                      </TableCell>
                      {COLUMNS.map((column) => {
                        const average = averages?.get(row.heroId);
                        return (
                          <TableCell
                            key={column.key}
                            className={cn("text-end tabular-nums", !showAllStats && column.className)}
                          >
                            {column.key === "winrate" ? (
                              <div className="flex items-center justify-end gap-2">
                                {average && (
                                  <HeroComparison
                                    heroId={row.heroId}
                                    metric="winrate"
                                    playerValue={row.winrate}
                                    averageValue={average.winrate}
                                    bracketLabel={bracketLabel}
                                    showAlways={showAllStats}
                                  />
                                )}
                                <span>{column.format(row)}</span>
                                <RateBar rate={row.winrate} className="hidden w-16 @md:block" />
                              </div>
                            ) : column.key === "recentWinrate" ? (
                              <FormDots form={formByHero.get(row.heroId) ?? []} className="justify-end" />
                            ) : column.key === "kda" ? (
                              <div className="flex items-center justify-end gap-2">
                                {average && (
                                  <HeroComparison
                                    heroId={row.heroId}
                                    metric="kda"
                                    playerValue={row.kda}
                                    averageValue={average.kda}
                                    bracketLabel={bracketLabel}
                                    showAlways={showAllStats}
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
                    <TableEmptyRow colSpan={COLUMNS.length + 1}>
                      {minimumMatches > 0
                        ? `No heroes with ${minimumMatches}+ games in the selected range`
                        : "No hero stats in the selected range"}
                    </TableEmptyRow>
                  )}
                </TableBody>
              </Table>
              {needsRank && rankQuery.fetchStatus === "paused" && rows.length > 0 ? (
                <TrackerQueryPaused description="Hero stats are available. Rank comparisons will update when you're back online." />
              ) : needsRank && rankQuery.isError && rows.length > 0 ? (
                <ErrorState
                  title={rankReady ? "Could not refresh comparison rank" : "Could not load comparison rank"}
                  description={
                    rankReady
                      ? "Comparisons use the last loaded rank. Your hero stats are still available."
                      : "Your hero stats are available. Retry the rank lookup to load comparisons for your rank."
                  }
                  onRetry={() => rankQuery.refetch()}
                  retrying={rankQuery.isFetching}
                />
              ) : rankReady && averagesQuery.isError && rows.length > 0 ? (
                <ErrorState
                  title={averages ? "Could not refresh hero comparisons" : "Could not load hero comparisons"}
                  description={
                    averages
                      ? "Showing the last loaded comparison averages. Your hero stats are still available."
                      : "Comparison averages are temporarily unavailable. Your hero stats are still available."
                  }
                  onRetry={() => averagesQuery.refetch()}
                  retrying={averagesQuery.isFetching}
                />
              ) : null}
              {averages && rows.length > 0 && (
                <p className={cn("text-xs text-muted-foreground", !showAllStats && "hidden @lg:block")}>
                  Compared with {bracketLabel} on the same hero in the selected range. Win-rate differences are in
                  percentage points (pp).
                </p>
              )}
            </div>
          );
        }}
      </QueryRenderer>
    </div>
  );
}
