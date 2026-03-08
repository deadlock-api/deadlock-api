import { useQuery } from "@tanstack/react-query";
import type { AnalyticsHeroStats } from "deadlock_api_client";
import { useMemo } from "react";
import HeroImage from "~/components/HeroImage";
import { LoadingLogo } from "~/components/LoadingLogo";
import HeroName from "~/components/HeroName";
import { ProgressBarWithLabel } from "~/components/primitives/ProgressBar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import type { GameMode } from "~/components/selectors/GameModeSelector";
import type { Dayjs } from "~/dayjs";
import { api } from "~/lib/api";

export default function HeroStatsTable({
  columns,
  limit,
  hideHeader,
  hideIndex,
  sortBy,
  minRankId,
  maxRankId,
  minHeroMatches,
  minHeroMatchesTotal,
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
  sortBy?: keyof AnalyticsHeroStats | "winrate";
  minRankId?: number;
  maxRankId?: number;
  minHeroMatches?: number;
  minHeroMatchesTotal?: number;
  minDate?: Dayjs;
  maxDate?: Dayjs;
  prevMinDate?: Dayjs;
  prevMaxDate?: Dayjs;
  gameMode?: GameMode;
}) {
  const minDateTimestamp = useMemo(() => minDate?.unix() ?? 0, [minDate]);
  const maxDateTimestamp = useMemo(() => maxDate?.unix(), [maxDate]);

  const { data: heroData, isLoading } = useQuery({
    queryKey: [
      "api-hero-stats",
      minRankId,
      maxRankId,
      minDateTimestamp,
      maxDateTimestamp,
      minHeroMatches,
      minHeroMatchesTotal,
      gameMode,
    ],
    queryFn: async () => {
      const response = await api.analytics_api.heroStats({
        minHeroMatches: minHeroMatches,
        minHeroMatchesTotal: minHeroMatchesTotal,
        minAverageBadge: minRankId,
        maxAverageBadge: maxRankId,
        minUnixTimestamp: minDateTimestamp,
        maxUnixTimestamp: maxDateTimestamp,
        gameMode: gameMode,
      });
      return response.data;
    },
    staleTime: 24 * 60 * 60 * 1000, // 24 hours
  });

  const prevMinTimestamp = useMemo(() => prevMinDate?.unix() ?? 0, [prevMinDate]);
  const prevMaxTimestamp = useMemo(() => prevMaxDate?.unix(), [prevMaxDate]);
  const hasPreviousInterval = prevMinDate != null && prevMaxDate != null;

  const { data: prevHeroData } = useQuery({
    queryKey: [
      "api-hero-stats",
      minRankId,
      maxRankId,
      prevMinTimestamp,
      prevMaxTimestamp,
      minHeroMatches,
      minHeroMatchesTotal,
      gameMode,
    ],
    queryFn: async () => {
      const response = await api.analytics_api.heroStats({
        minHeroMatches: minHeroMatches,
        minHeroMatchesTotal: minHeroMatchesTotal,
        minAverageBadge: minRankId,
        maxAverageBadge: maxRankId,
        minUnixTimestamp: prevMinTimestamp,
        maxUnixTimestamp: prevMaxTimestamp,
        gameMode: gameMode,
      });
      return response.data;
    },
    staleTime: 24 * 60 * 60 * 1000,
    enabled: hasPreviousInterval,
  });

  const pickrateMultiplier = gameMode === "street_brawl" ? 8 : 12;

  const prevStatsMap = useMemo(() => {
    if (!prevHeroData) return undefined;
    const prevSumMatches = prevHeroData.reduce((acc, row) => acc + row.matches, 0);
    const prevMaxMatches = Math.max(...prevHeroData.map((item) => item.matches));
    const map = new Map<number, { winrate: number; pickrate: number; normalizedPickrate: number }>();
    for (const row of prevHeroData) {
      map.set(row.hero_id, {
        winrate: row.wins / row.matches,
        pickrate: pickrateMultiplier * (row.matches / prevSumMatches),
        normalizedPickrate: row.matches / prevMaxMatches,
      });
    }
    return map;
  }, [prevHeroData, pickrateMultiplier]);

  const minWinrate = useMemo(() => Math.min(...(heroData || []).map((item) => item.wins / item.matches)), [heroData]);
  const maxWinrate = useMemo(() => Math.max(...(heroData || []).map((item) => item.wins / item.matches)), [heroData]);
  const minMatches = useMemo(() => Math.min(...(heroData || []).map((item) => item.matches)), [heroData]);
  const maxMatches = useMemo(() => Math.max(...(heroData || []).map((item) => item.matches)), [heroData]);
  const sumMatches = useMemo(() => heroData?.reduce((acc, row) => acc + row.matches, 0) || 0, [heroData]);
  const sortedData = useMemo(
    () =>
      sortBy
        ? [...(heroData || [])].sort((a, b) => {
            const a_score = sortBy !== "winrate" ? a[sortBy] : a.wins / a.matches;
            const b_score = sortBy !== "winrate" ? b[sortBy] : b.wins / b.matches;
            return b_score - a_score;
          })
        : heroData,
    [heroData, sortBy],
  );
  const limitedData = useMemo(() => (limit ? sortedData?.slice(0, limit) : sortedData), [sortedData, limit]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center w-full h-full py-16">
        <LoadingLogo />
      </div>
    );
  }

  return (
    <Table>
      {!hideHeader && (
        <TableHeader className="bg-muted">
          <TableRow>
            {!hideIndex && <TableHead className="text-center">#</TableHead>}
            <TableHead>Hero</TableHead>
            {columns.includes("winRate") && <TableHead className="text-center">Win Rate</TableHead>}
            {columns.includes("pickRate") && (
              <TableHead className="text-center">
                {minHeroMatchesTotal || minHeroMatches ? (
                  <>
                    Pick Rate
                    <br />
                    (Normalized)
                  </>
                ) : (
                  "Pick Rate"
                )}
              </TableHead>
            )}
            {columns.includes("KDA") && <TableHead className="text-center">Kills/Deaths/Assists</TableHead>}
            {columns.includes("totalMatches") && <TableHead className="text-center">Total Matches</TableHead>}
          </TableRow>
        </TableHeader>
      )}
      <TableBody>
        {limitedData?.map((row, index) => (
          <TableRow key={row.hero_id}>
            {!hideIndex && <TableCell className="font-semibold text-center">{index + 1}</TableCell>}
            <TableCell>
              <div className="flex items-center gap-2">
                <HeroImage heroId={row.hero_id} />
                <HeroName heroId={row.hero_id} />
              </div>
            </TableCell>
            {columns.includes("winRate") && (
              <TableCell>
                <ProgressBarWithLabel
                  min={minWinrate}
                  max={maxWinrate}
                  value={row.wins / row.matches}
                  color={"#fa4454"}
                  label={`${(Math.round((row.wins / row.matches) * 100)).toFixed(0)}% `}
                  delta={
                    prevStatsMap?.get(row.hero_id) !== undefined
                      ? row.wins / row.matches - prevStatsMap.get(row.hero_id)!.winrate
                      : undefined
                  }
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
                      {prevStatsMap?.get(row.hero_id) !== undefined && (
                        <div className="flex justify-between gap-4 border-t border-border pt-1 mt-0.5">
                          <span className="text-muted-foreground">Previous</span>
                          <span className="font-medium">
                            {(prevStatsMap.get(row.hero_id)!.winrate * 100).toFixed(2)}%
                          </span>
                        </div>
                      )}
                    </div>
                  }
                />
              </TableCell>
            )}
            {columns.includes("pickRate") && (
              <TableCell>
                <ProgressBarWithLabel
                  min={minMatches}
                  max={maxMatches}
                  value={row.matches}
                  color={"#22d3ee"}
                  label={
                    minHeroMatchesTotal || minHeroMatches
                      ? `${(Math.round((row.matches / maxMatches) * 100)).toFixed(0)}% `
                      : `${(Math.round(pickrateMultiplier * (row.matches / sumMatches) * 100)).toFixed(0)}% `
                  }
                  delta={
                    prevStatsMap?.get(row.hero_id) !== undefined
                      ? minHeroMatchesTotal || minHeroMatches
                        ? row.matches / maxMatches - prevStatsMap.get(row.hero_id)!.normalizedPickrate
                        : pickrateMultiplier * (row.matches / sumMatches) - prevStatsMap.get(row.hero_id)!.pickrate
                      : undefined
                  }
                  tooltip={
                    <div className="flex flex-col gap-1 text-xs">
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">Matches</span>
                        <span className="font-medium">{row.matches.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">Pick rate</span>
                        <span className="font-medium">
                          {(minHeroMatchesTotal || minHeroMatches
                            ? (row.matches / maxMatches) * 100
                            : pickrateMultiplier * (row.matches / sumMatches) * 100
                          ).toFixed(2)}
                          %
                        </span>
                      </div>
                      {prevStatsMap?.get(row.hero_id) !== undefined && (
                        <div className="flex justify-between gap-4 border-t border-border pt-1 mt-0.5">
                          <span className="text-muted-foreground">Previous</span>
                          <span className="font-medium">
                            {(
                              (minHeroMatchesTotal || minHeroMatches
                                ? prevStatsMap.get(row.hero_id)!.normalizedPickrate
                                : prevStatsMap.get(row.hero_id)!.pickrate) * 100
                            ).toFixed(2)}
                            %
                          </span>
                        </div>
                      )}
                    </div>
                  }
                />
              </TableCell>
            )}
            {columns.includes("KDA") && (
              <TableCell className="text-center">
                <span className="px-2 font-semibold text-green-500">
                  {(Math.round((row.total_kills / row.matches) * 10) / 10).toFixed(1)}
                </span>
                /
                <span className="px-2 font-semibold text-red-500">
                  {(Math.round((row.total_deaths / row.matches) * 10) / 10).toFixed(1)}
                </span>
                /
                <span className="px-2 font-semibold text-orange-500">
                  {(Math.round((row.total_assists / row.matches) * 10) / 10).toFixed(1)}
                </span>
              </TableCell>
            )}
            {columns.includes("totalMatches") && (
              <TableCell className="text-center">{row.matches.toLocaleString()}</TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
