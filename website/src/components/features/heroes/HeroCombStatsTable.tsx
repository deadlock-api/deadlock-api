import { useQuery } from "@tanstack/react-query";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { useMemo } from "react";

import { HeroCell } from "~/components/domain/assets/HeroCell";
import { SortableHeader } from "~/components/patterns/data-table/SortableHeader";
import { TableEmptyRow } from "~/components/patterns/data-table/TableEmptyRow";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { ProgressBarWithLabel } from "~/components/ui/progress-bar";
import { Inline } from "~/components/ui/stack";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { Tooltip, TooltipStat, TooltipStats, TooltipTarget } from "~/components/ui/tooltip";
import { CACHE_DURATIONS } from "~/constants/cache";
import type { Dayjs } from "~/dayjs";
import { useNormalizedTimeRange } from "~/hooks/useNormalizedTimeRange";
import { api } from "~/lib/api";
import { fineShareDigits, formatFineShare } from "~/lib/format";
import type { GameMode, MatchMode } from "~/lib/game-mode";
import { shrunkWinRate } from "~/lib/shrinkage";
import { queryKeys } from "~/queries/query-keys";

import { useHeroCombFilters } from "./useHeroCombFilters";

const SORT_KEYS = ["winRate", "share", "matches"] as const;
type SortKey = (typeof SORT_KEYS)[number];
const parseAsSortKey = parseAsStringLiteral(SORT_KEYS);
const parseAsSortDir = parseAsStringLiteral(["desc", "asc"] as const);

const combKey = (heroIds: number[]) => [...heroIds].sort((a, b) => a - b).join("-");

/**
 * The combinations the table can list for these filters. The API filters whole teams, so a combination may still be
 * missing an included hero, or repeat one.
 */
function listableCombs<Row extends { hero_ids: number[] }>(
  rows: Row[] | undefined,
  combSize: number,
  includeHeroIds: number[],
  excludeHeroIds: number[],
) {
  return (rows || [])
    .filter((row) => new Set(row.hero_ids).size === combSize)
    .filter((row) => includeHeroIds.every((heroId) => row.hero_ids.includes(heroId)))
    .filter((row) => !excludeHeroIds.some((heroId) => row.hero_ids.includes(heroId)));
}

export function HeroCombStatsTable({
  columns,
  limit,
  hideHeader,
  hideIndex,
  minRankId,
  maxRankId,
  minMatches: minHeroMatches,
  minDate,
  maxDate,
  prevMinDate,
  prevMaxDate,
  gameMode,
  matchMode,
}: {
  columns: string[];
  limit?: number;
  hideHeader?: boolean;
  hideIndex?: boolean;
  minRankId?: number;
  maxRankId?: number;
  minMatches?: number;
  minDate?: Dayjs;
  maxDate?: Dayjs;
  prevMinDate?: Dayjs;
  prevMaxDate?: Dayjs;
  gameMode?: GameMode;
  matchMode?: MatchMode;
}) {
  const { combSize: combSizeFilter, combsToShow, includeHeroIds, excludeHeroIds } = useHeroCombFilters(limit);

  const { minUnixTimestamp, maxUnixTimestamp } = useNormalizedTimeRange(minDate, maxDate);
  const { minUnixTimestamp: prevMinTimestamp, maxUnixTimestamp: prevMaxTimestamp } = useNormalizedTimeRange(
    prevMinDate,
    prevMaxDate,
  );
  const hasPreviousInterval = prevMinDate != null && prevMaxDate != null;

  const includeHeroIdsParam = includeHeroIds.length > 0 ? includeHeroIds : undefined;
  const excludeHeroIdsParam = excludeHeroIds.length > 0 ? excludeHeroIds : undefined;

  const combStatsQuery = {
    combSize: combSizeFilter,
    includeHeroIds: includeHeroIdsParam,
    excludeHeroIds: excludeHeroIdsParam,
    minMatches: minHeroMatches ?? 0,
    minAverageBadge: minRankId,
    maxAverageBadge: maxRankId,
    minUnixTimestamp: minUnixTimestamp ?? 0,
    maxUnixTimestamp,
    gameMode: gameMode,
    matchMode,
  };
  const {
    data: heroData,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: queryKeys.analytics.heroCombStats(combStatsQuery),
    queryFn: async () => {
      const response = await api.analytics_api.heroCombStats(combStatsQuery);
      return response.data;
    },
    staleTime: CACHE_DURATIONS.ONE_DAY,
  });

  const prevCombStatsQuery = {
    combSize: combSizeFilter,
    includeHeroIds: includeHeroIdsParam,
    excludeHeroIds: excludeHeroIdsParam,
    minMatches: minHeroMatches ?? 0,
    minAverageBadge: minRankId,
    maxAverageBadge: maxRankId,
    minUnixTimestamp: prevMinTimestamp ?? 0,
    maxUnixTimestamp: prevMaxTimestamp,
    gameMode: gameMode,
    matchMode,
  };
  const { data: prevHeroData } = useQuery({
    queryKey: queryKeys.analytics.heroCombStats(prevCombStatsQuery),
    queryFn: async () => {
      const response = await api.analytics_api.heroCombStats(prevCombStatsQuery);
      return response.data;
    },
    staleTime: CACHE_DURATIONS.ONE_DAY,
    enabled: hasPreviousInterval,
  });

  // A combination's share is its matches out of the matches of every listable combination, not only the rows shown,
  // so it keeps its meaning whatever "Show" is set to.
  const prevStatsMap = useMemo(() => {
    if (!prevHeroData) return undefined;
    const prevRows = listableCombs(prevHeroData, combSizeFilter, includeHeroIds, excludeHeroIds);
    const prevSumMatches = prevRows.reduce((acc, row) => acc + row.matches, 0);
    const map = new Map<string, { winrate: number; share: number }>();
    for (const row of prevRows) {
      map.set(combKey(row.hero_ids), {
        winrate: row.wins / row.matches,
        share: row.matches / prevSumMatches,
      });
    }
    return map;
  }, [prevHeroData, combSizeFilter, includeHeroIds, excludeHeroIds]);

  const [sortKey, setSortKey] = useQueryState("combo_sort", parseAsSortKey.withDefault("winRate"));
  const [sortDir, setSortDir] = useQueryState("combo_sort_dir", parseAsSortDir.withDefault("desc"));
  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      void setSortDir((dir) => (dir === "desc" ? "asc" : "desc"));
    } else {
      void setSortKey(key);
      void setSortDir("desc");
    }
  };

  // Sorted before the "Show" cut, so sorting by matches shows the most played combinations, not a reordered top 50.
  const sortedData = useMemo(
    () =>
      listableCombs(heroData, combSizeFilter, includeHeroIds, excludeHeroIds)
        .map((row) => ({
          row,
          // A raw win-rate sort would put every 100% combination with a dozen matches above
          // the ones proven over thousands. Share and match count order the same.
          score: sortKey === "winRate" ? shrunkWinRate(row.wins, row.matches) : row.matches,
        }))
        .sort((a, b) => (sortDir === "desc" ? b.score - a.score : a.score - b.score))
        .map(({ row }) => row),
    [heroData, combSizeFilter, includeHeroIds, excludeHeroIds, sortKey, sortDir],
  );
  const sumMatches = useMemo(() => sortedData.reduce((acc, row) => acc + row.matches, 0), [sortedData]);
  const limitedData = useMemo(() => sortedData.slice(0, combsToShow), [combsToShow, sortedData]);
  // The bars run from zero to the largest share shown, so a rare combination draws a short bar, not an empty one.
  const maxShare = useMemo(
    () => limitedData.reduce((max, row) => Math.max(max, row.matches / sumMatches), 0),
    [limitedData, sumMatches],
  );
  const minWinrate = useMemo(
    () => limitedData.reduce((min, row) => Math.min(min, row.wins / row.matches), 1),
    [limitedData],
  );
  const maxWinrate = useMemo(
    () => limitedData.reduce((max, row) => Math.max(max, row.wins / row.matches), 0),
    [limitedData],
  );

  return (
    <>
      {includeHeroIds.length > combSizeFilter && (
        <p className="mx-auto text-sm text-muted-foreground">
          No combination can contain all {includeHeroIds.length} included heroes at a combination size of{" "}
          {combSizeFilter}. Increase the combination size to see results.
        </p>
      )}
      {isLoading ? (
        <LoadingState label="hero combinations" align="center" />
      ) : isError && !heroData ? (
        <ErrorState title="Hero combinations did not load" onRetry={() => void refetch()} />
      ) : (
        <Table>
          {!hideHeader && (
            <TableHeader tone="muted">
              <TableRow>
                {!hideIndex && <TableHead className="text-center">#</TableHead>}
                <TableHead>Hero Combination</TableHead>
                {columns.includes("winRate") && (
                  <SortableHeader
                    label="Win Rate"
                    sortKey="winRate"
                    activeSortKey={sortKey}
                    sortDir={sortDir}
                    onSortChange={handleSort}
                    className="whitespace-normal"
                    description="Sorted by a confidence-adjusted win rate: a combination with few matches is pulled toward the average, so a lucky 100% over a dozen games does not outrank one proven over thousands."
                  />
                )}
                {columns.includes("pickRate") && (
                  <SortableHeader
                    label="Share of Combo Matches"
                    sortKey="share"
                    activeSortKey={sortKey}
                    sortDir={sortDir}
                    onSortChange={handleSort}
                    className="hidden whitespace-normal sm:table-cell"
                  />
                )}
                {columns.includes("totalMatches") && (
                  <SortableHeader
                    label="Total Matches"
                    sortKey="matches"
                    activeSortKey={sortKey}
                    sortDir={sortDir}
                    onSortChange={handleSort}
                    className="hidden sm:table-cell"
                  />
                )}
              </TableRow>
            </TableHeader>
          )}
          <TableBody>
            {limitedData.length === 0 && (
              <TableEmptyRow
                colSpan={
                  (hideIndex ? 1 : 2) +
                  ["winRate", "pickRate", "totalMatches"].filter((column) => columns.includes(column)).length
                }
              >
                No hero combinations with enough matches for these filters
              </TableEmptyRow>
            )}
            {limitedData.map((row, index) => (
              <TableRow key={row.hero_ids.join("-")}>
                {!hideIndex && <TableCell className="text-center font-semibold">{index + 1}</TableCell>}
                {/* On a narrow screen the heroes fold onto more lines, so the rates stay in view. */}
                <TableCell className="whitespace-normal">
                  <Inline gap={1.5}>
                    {row.hero_ids.map((heroId, i) => (
                      <Inline key={heroId} gap={1.5} wrap="nowrap">
                        {i > 0 && (
                          <span aria-hidden="true" className="text-lg text-muted-foreground">
                            +
                          </span>
                        )}
                        <HeroCell heroId={heroId} />
                      </Inline>
                    ))}
                  </Inline>
                </TableCell>
                {columns.includes("winRate") && (
                  <TableCell className="text-center">
                    <Tooltip
                      content={
                        <>
                          <TooltipStats variant="plain">
                            <TooltipStat label="Matches" value={row.matches.toLocaleString("en-US")} />
                            <TooltipStat label="Wins" value={row.wins.toLocaleString("en-US")} />
                            <TooltipStat label="Win rate" value={`${((row.wins / row.matches) * 100).toFixed(2)}%`} />
                          </TooltipStats>
                          {(() => {
                            const prev = prevStatsMap?.get(combKey(row.hero_ids));
                            return prev !== undefined ? (
                              <TooltipStats>
                                <TooltipStat label="Previous" value={`${(prev.winrate * 100).toFixed(2)}%`} />
                              </TooltipStats>
                            ) : null;
                          })()}
                        </>
                      }
                    >
                      <TooltipTarget display="block">
                        <ProgressBarWithLabel
                          min={minWinrate}
                          max={maxWinrate}
                          value={row.wins / row.matches}
                          color="var(--primary)"
                          label={`${Math.round((row.wins / row.matches) * 100)}%`}
                          delta={(() => {
                            const prev = prevStatsMap?.get(combKey(row.hero_ids));
                            return prev !== undefined ? row.wins / row.matches - prev.winrate : undefined;
                          })()}
                        />
                      </TooltipTarget>
                    </Tooltip>
                  </TableCell>
                )}
                {/* The share (matches of this combination out of the matches of every listed combination) and the matches
                    are secondary (the win rate tooltip has the matches): on a phone they give
                    their width to the heroes and the win rate. */}
                {columns.includes("pickRate") &&
                  (() => {
                    const share = row.matches / sumMatches;
                    const prev = prevStatsMap?.get(combKey(row.hero_ids));
                    return (
                      <TableCell className="hidden text-center sm:table-cell">
                        <Tooltip
                          content={
                            <>
                              <TooltipStats variant="plain">
                                <TooltipStat
                                  label="Matches"
                                  value={`${row.matches.toLocaleString("en-US")} of ${sumMatches.toLocaleString("en-US")}`}
                                />
                                <TooltipStat label="Share" value={formatFineShare(share)} />
                              </TooltipStats>
                              {prev !== undefined && (
                                <TooltipStats>
                                  <TooltipStat label="Previous" value={formatFineShare(prev.share)} />
                                </TooltipStats>
                              )}
                            </>
                          }
                        >
                          <TooltipTarget display="block">
                            <ProgressBarWithLabel
                              min={0}
                              max={maxShare}
                              value={share}
                              color="var(--chart-4)"
                              label={formatFineShare(share)}
                              delta={prev !== undefined ? share - prev.share : undefined}
                              deltaDigits={fineShareDigits(share)}
                            />
                          </TooltipTarget>
                        </Tooltip>
                      </TableCell>
                    );
                  })()}
                {columns.includes("totalMatches") && (
                  <TableCell className="hidden text-center sm:table-cell">
                    {row.matches.toLocaleString("en-US")}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
}
