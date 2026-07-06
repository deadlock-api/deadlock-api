import { useQuery } from "@tanstack/react-query";
import { parseAsInteger, useQueryState } from "nuqs";
import { Fragment, useId, useMemo } from "react";

import { ItemImage } from "~/components/ItemImage";
import { ItemName } from "~/components/ItemName";
import { LoadingLogo } from "~/components/LoadingLogo";
import { ProgressBarWithLabel } from "~/components/primitives/ProgressBar";
import type { GameMode } from "~/components/selectors/GameModeSelector";
import { Slider } from "~/components/ui/slider";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { CACHE_DURATIONS } from "~/constants/cache";
import type { Dayjs } from "~/dayjs";
import { useDraftValue } from "~/hooks/useDraftValue";
import { useNormalizedTimeRange } from "~/hooks/useNormalizedTimeRange";
import { api } from "~/lib/api";
import { itemUpgradesQueryOptions } from "~/queries/asset-queries";
import { queryKeys } from "~/queries/query-keys";

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
  hero?: number | null;
}) {
  const combSizeId = useId();
  const combsToShowId = useId();

  const [combSizeFilter, setCombSizeFilter] = useQueryState("item_comb_size", parseAsInteger.withDefault(2));
  const [combSizeDraft, setCombSizeDraft] = useDraftValue(combSizeFilter);
  const [combsToShow, setCombsToShow] = useQueryState("item_combs_to_show", parseAsInteger.withDefault(limit ?? 50));
  const [combsToShowDraft, setCombsToShowDraft] = useDraftValue(combsToShow);

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

  const sortedData = useMemo(
    () => [...filteredData].sort((a, b) => b.wins / b.matches - a.wins / a.matches),
    [filteredData],
  );
  const numCombs = useMemo(() => filteredData.length || 100, [filteredData]);
  const limitedData = useMemo(() => sortedData.slice(0, combsToShow), [combsToShow, sortedData]);

  // Normalized against the displayed rows, not the full fetched set: with hundreds of
  // purchasable items, the full set spans everything from once-in-a-blue-moon pairs to
  // near-universal starter-item pairs bought in nearly every match, so normalizing pick
  // rate against its max/sum would crush every displayed (win-rate-sorted) row toward 0%.
  const sumMatches = useMemo(() => limitedData.reduce((acc, row) => acc + row.matches, 0), [limitedData]);
  const minMatchesVal = useMemo(
    () => limitedData.reduce((min, row) => Math.min(min, row.matches), Infinity),
    [limitedData],
  );
  const maxMatchesVal = useMemo(
    () => limitedData.reduce((max, row) => Math.max(max, row.matches), -Infinity),
    [limitedData],
  );
  const minWinrate = useMemo(
    () => limitedData[limitedData.length - 1]?.wins / limitedData[limitedData.length - 1]?.matches || 0,
    [limitedData],
  );
  const maxWinrate = useMemo(() => limitedData[0]?.wins / limitedData[0]?.matches || 0, [limitedData]);

  // Normalized against the current period's displayed-row basis (sumMatches/maxMatchesVal), not
  // the previous period's own full fetched set, so the delta compares like with like.
  const prevStatsMap = useMemo(() => {
    if (!prevItemCombData) return undefined;
    const map = new Map<string, { winrate: number; pickrate: number; normalizedPickrate: number }>();
    for (const row of prevItemCombData) {
      const key = [...row.item_ids].sort((a, b) => a - b).join("-");
      map.set(key, {
        winrate: row.wins / row.matches,
        pickrate: row.matches / sumMatches,
        normalizedPickrate: row.matches / maxMatchesVal,
      });
    }
    return map;
  }, [prevItemCombData, sumMatches, maxMatchesVal]);

  return (
    <>
      <div className="mx-auto flex flex-wrap justify-center gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={combSizeId} className="text-sm text-nowrap text-muted-foreground">
            Combination Size
          </label>
          <div className="flex items-center gap-2">
            <Slider
              id={combSizeId}
              min={2}
              max={4}
              value={[combSizeDraft]}
              onValueChange={([val]) => {
                if (val !== undefined) setCombSizeDraft(val);
              }}
              onValueCommit={([val]) => {
                if (val !== undefined) setCombSizeFilter(val);
              }}
              className="w-full"
            />
            <span className="ml-2">{combSizeDraft}</span>
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
              value={[combsToShowDraft]}
              onValueChange={([val]) => {
                if (val !== undefined) setCombsToShowDraft(val);
              }}
              onValueCommit={([val]) => {
                if (val !== undefined) setCombsToShow(val);
              }}
              className="w-full"
            />
            <span className="ml-2">{combsToShowDraft}</span>
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
                <TableHead>Item Combination</TableHead>
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
              <TableRow key={row.item_ids.join("-")}>
                {!hideIndex && <TableCell className="text-center font-semibold">{index + 1}</TableCell>}
                <TableCell>
                  <div className="flex items-center gap-2">
                    {row.item_ids.map((itemId, i) => (
                      <Fragment key={itemId}>
                        {i > 0 && <span className="text-2xl">+</span>}
                        <div className="flex items-center gap-2">
                          <ItemImage itemId={itemId} />
                          <ItemName itemId={itemId} />
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
                        const key = [...row.item_ids].sort((a, b) => a - b).join("-");
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
                            const key = [...row.item_ids].sort((a, b) => a - b).join("-");
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
                      min={minMatchesVal}
                      max={maxMatchesVal}
                      value={row.matches}
                      color={"#22d3ee"}
                      label={`${Math.round((row.matches / maxMatchesVal) * 100).toFixed(0)}%`}
                      delta={(() => {
                        const key = [...row.item_ids].sort((a, b) => a - b).join("-");
                        const prev = prevStatsMap?.get(key);
                        return prev !== undefined ? row.matches / maxMatchesVal - prev.normalizedPickrate : undefined;
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
                            const key = [...row.item_ids].sort((a, b) => a - b).join("-");
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
