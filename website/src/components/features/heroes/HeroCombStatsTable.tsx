import { useQuery } from "@tanstack/react-query";
import { Fragment, useMemo } from "react";

import { HeroCell } from "~/components/domain/assets/HeroCell";
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
import type { GameMode, MatchMode } from "~/lib/game-mode";
import { shrunkWinRate } from "~/lib/shrinkage";
import { queryKeys } from "~/queries/query-keys";

import { useHeroCombFilters } from "./useHeroCombFilters";

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

  const prevStatsMap = useMemo(() => {
    if (!prevHeroData) return undefined;
    const prevSumMatches = prevHeroData.reduce((acc, row) => acc + row.matches, 0);
    const prevMaxMatches = Math.max(...prevHeroData.map((row) => row.matches));
    const map = new Map<string, { winrate: number; pickrate: number; normalizedPickrate: number }>();
    for (const row of prevHeroData) {
      const key = [...row.hero_ids].sort((a, b) => a - b).join("-");
      map.set(key, {
        winrate: row.wins / row.matches,
        pickrate: row.matches / prevSumMatches,
        normalizedPickrate: row.matches / prevMaxMatches,
      });
    }
    return map;
  }, [prevHeroData]);

  const sumMatches = useMemo(() => heroData?.reduce((acc, row) => acc + row.matches, 0) || 0, [heroData]);
  const minMatches = useMemo(() => Math.min(...(heroData || []).map((item) => item.matches)), [heroData]);
  const maxMatches = useMemo(() => Math.max(...(heroData || []).map((item) => item.matches)), [heroData]);
  const sortedData = useMemo(
    () =>
      [...(heroData || [])]
        .filter((row) => new Set(row.hero_ids).size === combSizeFilter)
        // The API filters whole teams, so a combination may still be missing an included hero.
        .filter((row) => includeHeroIds.every((heroId) => row.hero_ids.includes(heroId)))
        .filter((row) => !excludeHeroIds.some((heroId) => row.hero_ids.includes(heroId)))
        // A raw win-rate sort would put every 100% combination with a dozen matches above
        // the ones proven over thousands.
        .map((row) => ({ row, score: shrunkWinRate(row.wins, row.matches) }))
        .sort((a, b) => b.score - a.score)
        .map(({ row }) => row),
    [heroData, combSizeFilter, includeHeroIds, excludeHeroIds],
  );
  const limitedData = useMemo(() => sortedData?.slice(0, combsToShow), [combsToShow, sortedData]);
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
                  <TableHead className="text-center">
                    Win Rate
                    <br />
                    (Confidence Ranked)
                  </TableHead>
                )}
                {columns.includes("pickRate") && (
                  <TableHead className="text-center">
                    Pick Rate
                    <br />
                    (Normalized)
                  </TableHead>
                )}
                {columns.includes("totalMatches") && <TableHead className="text-center">Total Matches</TableHead>}
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
                <TableCell>
                  <Inline wrap="nowrap">
                    {row.hero_ids.map((heroId, i) => (
                      <Fragment key={heroId}>
                        {i > 0 && <span className="text-2xl">+</span>}
                        <HeroCell heroId={heroId} />
                      </Fragment>
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
                            const key = [...row.hero_ids].sort((a, b) => a - b).join("-");
                            const prev = prevStatsMap?.get(key);
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
                          label={`${Math.round((row.wins / row.matches) * 100).toFixed(0)}% `}
                          delta={(() => {
                            const key = [...row.hero_ids].sort((a, b) => a - b).join("-");
                            const prev = prevStatsMap?.get(key);
                            return prev !== undefined ? row.wins / row.matches - prev.winrate : undefined;
                          })()}
                        />
                      </TooltipTarget>
                    </Tooltip>
                  </TableCell>
                )}
                {columns.includes("pickRate") && (
                  <TableCell className="text-center">
                    <Tooltip
                      content={
                        <>
                          <TooltipStats variant="plain">
                            <TooltipStat
                              label="Matches"
                              value={`${row.matches.toLocaleString("en-US")} / ${sumMatches.toLocaleString("en-US")}`}
                            />
                            <TooltipStat
                              label="Pick rate"
                              value={`${((row.matches / sumMatches) * 100).toFixed(4)}%`}
                            />
                          </TooltipStats>
                          {(() => {
                            const key = [...row.hero_ids].sort((a, b) => a - b).join("-");
                            const prev = prevStatsMap?.get(key);
                            return prev !== undefined ? (
                              <TooltipStats>
                                <TooltipStat label="Previous" value={`${(prev.pickrate * 100).toFixed(4)}%`} />
                              </TooltipStats>
                            ) : null;
                          })()}
                        </>
                      }
                    >
                      <TooltipTarget display="block">
                        <ProgressBarWithLabel
                          min={minMatches}
                          max={maxMatches}
                          value={row.matches}
                          color="var(--chart-4)"
                          label={`${Math.round((row.matches / maxMatches) * 100).toFixed(0)}%`}
                          delta={(() => {
                            const key = [...row.hero_ids].sort((a, b) => a - b).join("-");
                            const prev = prevStatsMap?.get(key);
                            return prev !== undefined ? row.matches / maxMatches - prev.normalizedPickrate : undefined;
                          })()}
                        />
                      </TooltipTarget>
                    </Tooltip>
                  </TableCell>
                )}
                {columns.includes("totalMatches") && (
                  <TableCell className="text-center">{row.matches.toLocaleString("en-US")}</TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
}
