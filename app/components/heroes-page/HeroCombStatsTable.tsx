import { useQuery } from "@tanstack/react-query";
import { parseAsInteger, useQueryState } from "nuqs";
import { useEffect, useId, useMemo, useState } from "react";

import { HeroImage } from "~/components/HeroImage";
import { HeroName } from "~/components/HeroName";
import { LoadingLogo } from "~/components/LoadingLogo";
import { ProgressBarWithLabel } from "~/components/primitives/ProgressBar";
import type { GameMode } from "~/components/selectors/GameModeSelector";
import { Slider } from "~/components/ui/slider";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { CACHE_DURATIONS } from "~/constants/cache";
import type { Dayjs } from "~/dayjs";
import { api } from "~/lib/api";
import { queryKeys } from "~/queries/query-keys";

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
}) {
  const combSizeId = useId();
  const combsToShowId = useId();

  const [combSizeFilter, setCombSizeFilter] = useQueryState("comb_size", parseAsInteger.withDefault(2));
  const [combSizeLocal, setCombSizeLocal] = useState(combSizeFilter);
  const [combsToShow, setCombsToShow] = useQueryState("combs_to_show", parseAsInteger.withDefault(limit ?? 50));
  const [combsToShowLocal, setCombsToShowLocal] = useState(combsToShow);

  useEffect(() => setCombSizeLocal(combSizeFilter), [combSizeFilter]);
  useEffect(() => setCombsToShowLocal(combsToShow), [combsToShow]);

  const minDateTimestamp = useMemo(() => minDate?.unix() ?? 0, [minDate]);
  const maxDateTimestamp = useMemo(() => maxDate?.unix(), [maxDate]);

  const prevMinTimestamp = useMemo(() => prevMinDate?.unix() ?? 0, [prevMinDate]);
  const prevMaxTimestamp = useMemo(() => prevMaxDate?.unix(), [prevMaxDate]);
  const hasPreviousInterval = prevMinDate != null && prevMaxDate != null;

  const { data: heroData, isLoading } = useQuery({
    queryKey: queryKeys.analytics.heroCombStats(
      minRankId,
      maxRankId,
      minDateTimestamp,
      maxDateTimestamp,
      combSizeFilter,
      minHeroMatches,
      gameMode,
    ),
    queryFn: async () => {
      const response = await api.analytics_api.heroCombStats({
        combSize: combSizeFilter,
        minMatches: minHeroMatches ?? 0,
        minAverageBadge: minRankId ?? 0,
        maxAverageBadge: maxRankId ?? 116,
        minUnixTimestamp: minDateTimestamp,
        maxUnixTimestamp: maxDateTimestamp,
        gameMode: gameMode,
      });
      return response.data;
    },
    staleTime: CACHE_DURATIONS.ONE_DAY,
  });

  const { data: prevHeroData } = useQuery({
    queryKey: queryKeys.analytics.heroCombStats(
      minRankId,
      maxRankId,
      prevMinTimestamp,
      prevMaxTimestamp,
      combSizeFilter,
      minHeroMatches,
      gameMode,
    ),
    queryFn: async () => {
      const response = await api.analytics_api.heroCombStats({
        combSize: combSizeFilter,
        minMatches: minHeroMatches ?? 0,
        minAverageBadge: minRankId ?? 0,
        maxAverageBadge: maxRankId ?? 116,
        minUnixTimestamp: prevMinTimestamp,
        maxUnixTimestamp: prevMaxTimestamp,
        gameMode: gameMode,
      });
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
        .sort((a, b) => b?.wins / b?.matches - a?.wins / a?.matches),
    [heroData, combSizeFilter],
  );
  const minWinrate = useMemo(
    () => sortedData[sortedData.length - 1]?.wins / sortedData[sortedData.length - 1]?.matches || 0,
    [sortedData],
  );
  const maxWinrate = useMemo(() => sortedData[0]?.wins / sortedData[0]?.matches || 0, [sortedData]);
  const numCombs = useMemo(() => heroData?.length ?? 100, [heroData]);
  const limitedData = useMemo(() => sortedData?.slice(0, combsToShow), [combsToShow, sortedData]);

  return (
    <>
      <div className="mx-auto flex flex-wrap gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={combSizeId} className="text-sm text-nowrap text-muted-foreground">
            Combination Size
          </label>
          <div className="flex items-center gap-2">
            <Slider
              id={combSizeId}
              min={2}
              max={6}
              value={[combSizeLocal]}
              onValueCommit={([val]) => setCombSizeFilter(val)}
              onValueChange={([val]) => setCombSizeLocal(val)}
              className="w-full"
            />
            <span className="ml-2">{combSizeLocal}</span>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={combsToShowId} className="text-sm text-nowrap text-muted-foreground">
            Combinations to Show
          </label>
          <div className="flex items-center gap-2">
            <Slider
              id={combsToShowId}
              min={0}
              step={100}
              max={Math.min(500, numCombs)}
              value={[combsToShowLocal]}
              onValueCommit={([val]) => setCombsToShow(val)}
              onValueChange={([val]) => setCombsToShowLocal(val)}
              className="w-full"
            />
            <span className="ml-2">{combsToShowLocal}</span>
          </div>
        </div>
      </div>
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
                      <>
                        {i > 0 && <span className="text-2xl">+</span>}
                        <div key={heroId} className="flex items-center gap-2">
                          <HeroImage heroId={heroId} />
                          <HeroName heroId={heroId} />
                        </div>
                      </>
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
                            <span className="font-medium">{row.matches.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between gap-4">
                            <span className="text-muted-foreground">Wins</span>
                            <span className="font-medium">{row.wins.toLocaleString()}</span>
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
                              {row.matches.toLocaleString()} / {sumMatches.toLocaleString()}
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
                  <TableCell className="text-center">{row.matches.toLocaleString()}</TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
}
