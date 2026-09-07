import { useQuery } from "@tanstack/react-query";
import { Fragment, useMemo } from "react";

import { HeroImage } from "~/components/HeroImage";
import { HeroName } from "~/components/HeroName";
import { LoadingLogo } from "~/components/LoadingLogo";
import { ProgressBarWithLabel } from "~/components/primitives/ProgressBar";
import type { GameMode } from "~/components/selectors/GameModeSelector";
import type { MatchMode } from "~/components/selectors/MatchModeSelector";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { CACHE_DURATIONS } from "~/constants/cache";
import type { Dayjs } from "~/dayjs";
import { useNormalizedTimeRange } from "~/hooks/useNormalizedTimeRange";
import { api } from "~/lib/api";
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
  const { data: heroData, isLoading } = useQuery({
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
        .sort((a, b) => b?.wins / b?.matches - a?.wins / a?.matches),
    [heroData, combSizeFilter, includeHeroIds, excludeHeroIds],
  );
  const minWinrate = useMemo(
    () => sortedData[sortedData.length - 1]?.wins / sortedData[sortedData.length - 1]?.matches || 0,
    [sortedData],
  );
  const maxWinrate = useMemo(() => sortedData[0]?.wins / sortedData[0]?.matches || 0, [sortedData]);
  const limitedData = useMemo(() => sortedData?.slice(0, combsToShow), [combsToShow, sortedData]);

  return (
    <>
      {includeHeroIds.length > combSizeFilter && (
        <p className="mx-auto text-sm text-muted-foreground">
          No combination can contain all {includeHeroIds.length} included heroes at a combination size of{" "}
          {combSizeFilter}. Increase the combination size to see results.
        </p>
      )}
      {isLoading ? (
        <div className="flex h-full w-full items-center justify-center py-16">
          <LoadingLogo />
        </div>
      ) : (
        <Table>
          {!hideHeader && (
            <TableHeader className="bg-muted">
              <TableRow>
                {!hideIndex && <TableHead className="text-center">#</TableHead>}
                <TableHead>Hero Combination</TableHead>
                {columns.includes("winRate") && <TableHead className="text-center">Win Rate</TableHead>}
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
            {limitedData?.map((row, index) => (
              <TableRow key={row.hero_ids.join("-")}>
                {!hideIndex && <TableCell className="text-center font-semibold">{index + 1}</TableCell>}
                <TableCell>
                  <div className="flex items-center gap-2">
                    {row.hero_ids.map((heroId, i) => (
                      <Fragment key={heroId}>
                        {i > 0 && <span className="text-2xl">+</span>}
                        <div className="flex items-center gap-2">
                          <HeroImage heroId={heroId} />
                          <HeroName heroId={heroId} />
                        </div>
                      </Fragment>
                    ))}
                  </div>
                </TableCell>
                {columns.includes("winRate") && (
                  <TableCell className="text-center">
                    <ProgressBarWithLabel
                      min={minWinrate}
                      max={maxWinrate}
                      value={row.wins / row.matches}
                      color={"#fa4454"}
                      label={`${Math.round((row.wins / row.matches) * 100).toFixed(0)}% `}
                      delta={(() => {
                        const key = [...row.hero_ids].sort((a, b) => a - b).join("-");
                        const prev = prevStatsMap?.get(key);
                        return prev !== undefined ? row.wins / row.matches - prev.winrate : undefined;
                      })()}
                      tooltip={
                        <div className="flex flex-col gap-1 text-xs">
                          <div className="flex justify-between gap-4">
                            <span className="text-muted-foreground">Matches</span>
                            <span className="font-medium">{row.matches.toLocaleString("en-US")}</span>
                          </div>
                          <div className="flex justify-between gap-4">
                            <span className="text-muted-foreground">Wins</span>
                            <span className="font-medium">{row.wins.toLocaleString("en-US")}</span>
                          </div>
                          <div className="flex justify-between gap-4">
                            <span className="text-muted-foreground">Win rate</span>
                            <span className="font-medium">{((row.wins / row.matches) * 100).toFixed(2)}%</span>
                          </div>
                          {(() => {
                            const key = [...row.hero_ids].sort((a, b) => a - b).join("-");
                            const prev = prevStatsMap?.get(key);
                            return prev !== undefined ? (
                              <div className="mt-0.5 flex justify-between gap-4 border-t border-border pt-1">
                                <span className="text-muted-foreground">Previous</span>
                                <span className="font-medium">{(prev.winrate * 100).toFixed(2)}%</span>
                              </div>
                            ) : null;
                          })()}
                        </div>
                      }
                    />
                  </TableCell>
                )}
                {columns.includes("pickRate") && (
                  <TableCell className="text-center">
                    <ProgressBarWithLabel
                      min={minMatches}
                      max={maxMatches}
                      value={row.matches}
                      color={"#22d3ee"}
                      label={`${Math.round((row.matches / maxMatches) * 100).toFixed(0)}%`}
                      delta={(() => {
                        const key = [...row.hero_ids].sort((a, b) => a - b).join("-");
                        const prev = prevStatsMap?.get(key);
                        return prev !== undefined ? row.matches / maxMatches - prev.normalizedPickrate : undefined;
                      })()}
                      tooltip={
                        <div className="flex flex-col gap-1 text-xs">
                          <div className="flex justify-between gap-4">
                            <span className="text-muted-foreground">Matches</span>
                            <span className="font-medium">
                              {row.matches.toLocaleString("en-US")} / {sumMatches.toLocaleString("en-US")}
                            </span>
                          </div>
                          <div className="flex justify-between gap-4">
                            <span className="text-muted-foreground">Pick rate</span>
                            <span className="font-medium">{((row.matches / sumMatches) * 100).toFixed(4)}%</span>
                          </div>
                          {(() => {
                            const key = [...row.hero_ids].sort((a, b) => a - b).join("-");
                            const prev = prevStatsMap?.get(key);
                            return prev !== undefined ? (
                              <div className="mt-0.5 flex justify-between gap-4 border-t border-border pt-1">
                                <span className="text-muted-foreground">Previous</span>
                                <span className="font-medium">{(prev.pickrate * 100).toFixed(4)}%</span>
                              </div>
                            ) : null;
                          })()}
                        </div>
                      }
                    />
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
