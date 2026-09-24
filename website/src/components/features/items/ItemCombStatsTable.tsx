import { useQuery } from "@tanstack/react-query";
import { Fragment, memo, useMemo } from "react";

import { ItemCell } from "~/components/domain/assets/ItemCell";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { ProgressBarWithLabel } from "~/components/ui/progress-bar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { Tooltip, TooltipHeader, TooltipStat, TooltipStats, TooltipTarget } from "~/components/ui/tooltip";
import { CACHE_DURATIONS } from "~/constants/cache";
import type { Dayjs } from "~/dayjs";
import { useNormalizedTimeRange } from "~/hooks/useNormalizedTimeRange";
import { api } from "~/lib/api";
import { fineShareDigits, formatFineShare } from "~/lib/format";
import type { GameMode, MatchMode } from "~/lib/game-mode";
import { shrunkWinRate } from "~/lib/shrinkage";
import { itemUpgradesQueryOptions } from "~/queries/asset-queries";
import { queryKeys } from "~/queries/query-keys";

import { useItemCombFilters } from "./useItemCombFilters";

const ComboItems = memo(function ComboItems({ itemIds }: { itemIds: number[] }) {
  return (
    <TableCell>
      <div className="flex items-center gap-2">
        {itemIds.map((itemId, i) => (
          <Fragment key={itemId}>
            {i > 0 && <span className="text-2xl">+</span>}
            <ItemCell itemId={itemId} linkToDetail />
          </Fragment>
        ))}
      </div>
    </TableCell>
  );
});

const combKey = (itemIds: number[]) => [...itemIds].sort((a, b) => a - b).join("-");

export function ItemCombStatsTable({
  columns,
  limit,
  hideHeader,
  hideIndex,
  minRankId,
  maxRankId,
  minMatches,
  minDate,
  maxDate,
  prevMinDate,
  prevMaxDate,
  gameMode,
  matchMode,
  hero,
}: {
  columns: string[];
  limit?: number;
  hideHeader?: boolean;
  hideIndex?: boolean;
  minRankId?: number;
  maxRankId?: number;
  minMatches?: number | null;
  minDate?: Dayjs;
  maxDate?: Dayjs;
  prevMinDate?: Dayjs;
  prevMaxDate?: Dayjs;
  gameMode?: GameMode;
  matchMode?: MatchMode;
  hero?: number | null;
}) {
  const { combSize: combSizeFilter, combsToShow } = useItemCombFilters(limit);

  const { minUnixTimestamp, maxUnixTimestamp } = useNormalizedTimeRange(minDate, maxDate);
  const { minUnixTimestamp: prevMinTimestamp, maxUnixTimestamp: prevMaxTimestamp } = useNormalizedTimeRange(
    prevMinDate,
    prevMaxDate,
  );
  const hasPreviousInterval = prevMinDate != null && prevMaxDate != null;

  const { data: assetsItems } = useQuery(itemUpgradesQueryOptions);
  const shopableItemIds = useMemo(
    () => new Set((assetsItems || []).filter((i) => !i.disabled && i.shopable && i.shop_image_webp).map((i) => i.id)),
    [assetsItems],
  );

  const combStatsQuery = {
    combSize: combSizeFilter,
    heroId: hero,
    minMatches: minMatches ?? undefined,
    minAverageBadge: minRankId,
    maxAverageBadge: maxRankId,
    minUnixTimestamp: minUnixTimestamp ?? 0,
    maxUnixTimestamp,
    gameMode: gameMode,
    matchMode,
  };
  const { data: itemCombData, isLoading } = useQuery({
    queryKey: queryKeys.analytics.itemPermutationStats(combStatsQuery),
    queryFn: async () => {
      const response = await api.analytics_api.itemPermutationStats(combStatsQuery);
      return response.data;
    },
    staleTime: CACHE_DURATIONS.ONE_DAY,
  });

  const prevCombStatsQuery = {
    combSize: combSizeFilter,
    heroId: hero,
    minMatches: minMatches ?? undefined,
    minAverageBadge: minRankId,
    maxAverageBadge: maxRankId,
    minUnixTimestamp: prevMinTimestamp ?? 0,
    maxUnixTimestamp: prevMaxTimestamp,
    gameMode: gameMode,
    matchMode,
  };
  const { data: prevItemCombData } = useQuery({
    queryKey: queryKeys.analytics.itemPermutationStats(prevCombStatsQuery),
    queryFn: async () => {
      const response = await api.analytics_api.itemPermutationStats(prevCombStatsQuery);
      return response.data;
    },
    staleTime: CACHE_DURATIONS.ONE_DAY,
    enabled: hasPreviousInterval,
  });

  const filteredData = useMemo(
    () => (itemCombData || []).filter((row) => row.item_ids.every((id) => shopableItemIds.has(id))),
    [itemCombData, shopableItemIds],
  );

  // A raw win-rate sort would put every 100% combination with a dozen matches above the ones
  // proven over thousands.
  const sortedData = useMemo(
    () =>
      filteredData
        .map((row) => ({ row, score: shrunkWinRate(row.wins, row.matches) }))
        .sort((a, b) => b.score - a.score)
        .map(({ row }) => row),
    [filteredData],
  );
  const limitedData = useMemo(() => sortedData.slice(0, combsToShow), [combsToShow, sortedData]);

  // A combination's share is its matches out of the matches of every listable combination, not only the rows shown,
  // so it keeps its meaning whatever "Show" is set to. Shares of item pairs are small (hundreds of items pair up), so
  // the bars run from zero to the largest share shown: a rare combination draws a short bar, not an empty one.
  const sumMatches = useMemo(() => filteredData.reduce((acc, row) => acc + row.matches, 0), [filteredData]);
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

  // The previous interval's shares are taken over its own listable combinations, the same basis as the current ones,
  // so intervals of different length compare fairly.
  const prevStatsMap = useMemo(() => {
    if (!prevItemCombData) return undefined;
    const prevRows = prevItemCombData.filter((row) => row.item_ids.every((id) => shopableItemIds.has(id)));
    const prevSumMatches = prevRows.reduce((acc, row) => acc + row.matches, 0);
    const map = new Map<string, { winrate: number; share: number }>();
    for (const row of prevRows) {
      map.set(combKey(row.item_ids), {
        winrate: row.wins / row.matches,
        share: row.matches / prevSumMatches,
      });
    }
    return map;
  }, [prevItemCombData, shopableItemIds]);

  return (
    <>
      {isLoading ? (
        <LoadingState label="item combinations" align="center" />
      ) : (
        <Table>
          {!hideHeader && (
            <TableHeader tone="muted">
              <TableRow>
                {!hideIndex && <TableHead className="text-center">#</TableHead>}
                <TableHead>Item Combination</TableHead>
                {columns.includes("winRate") && (
                  <TableHead className="text-center">
                    Win Rate
                    <br />
                    (Confidence Ranked)
                  </TableHead>
                )}
                {columns.includes("pickRate") && (
                  <TableHead className="text-center">
                    Share of
                    <br />
                    Combo Matches
                  </TableHead>
                )}
                {columns.includes("totalMatches") && <TableHead className="text-center">Total Matches</TableHead>}
              </TableRow>
            </TableHeader>
          )}
          <TableBody>
            {limitedData.map((row, index) => {
              const prev = prevStatsMap?.get(combKey(row.item_ids));
              const share = row.matches / sumMatches;
              return (
                <TableRow key={row.item_ids.join("-")}>
                  {!hideIndex && <TableCell className="text-center font-semibold">{index + 1}</TableCell>}
                  <ComboItems itemIds={row.item_ids} />
                  {columns.includes("winRate") && (
                    <TableCell className="text-center">
                      <Tooltip
                        content={
                          <>
                            <TooltipHeader title="Win rate" />
                            <TooltipStats>
                              <TooltipStat label="Matches" value={row.matches.toLocaleString("en-US")} />
                              <TooltipStat label="Wins" value={row.wins.toLocaleString("en-US")} />
                              <TooltipStat label="Win rate" value={`${((row.wins / row.matches) * 100).toFixed(2)}%`} />
                              {prev !== undefined && (
                                <TooltipStat label="Previous" value={`${(prev.winrate * 100).toFixed(2)}%`} />
                              )}
                            </TooltipStats>
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
                            delta={prev !== undefined ? row.wins / row.matches - prev.winrate : undefined}
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
                            <TooltipHeader title="Share of combo matches" />
                            <TooltipStats>
                              <TooltipStat
                                label="Matches"
                                value={`${row.matches.toLocaleString("en-US")} of ${sumMatches.toLocaleString("en-US")}`}
                              />
                              <TooltipStat label="Share" value={formatFineShare(share)} />
                              {prev !== undefined && (
                                <TooltipStat label="Previous" value={formatFineShare(prev.share)} />
                              )}
                            </TooltipStats>
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
                  )}
                  {columns.includes("totalMatches") && (
                    <TableCell className="text-center">{row.matches.toLocaleString("en-US")}</TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </>
  );
}
