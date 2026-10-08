import { useQuery } from "@tanstack/react-query";
import { Fragment, memo, useMemo } from "react";

import { ItemCell } from "~/components/domain/assets/ItemCell";
import { CHART_COLOR } from "~/components/patterns/charts/theme";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { ProgressBarWithLabel } from "~/components/ui/progress-bar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { Tooltip, TooltipHeader, TooltipStat, TooltipStats, TooltipTarget } from "~/components/ui/tooltip";
import type { Dayjs } from "~/dayjs";
import { useNormalizedTimeRange } from "~/hooks/useNormalizedTimeRange";
import { fineShareDigits, formatFineShare } from "~/lib/format";
import type { GameMode, MatchMode } from "~/lib/game-mode";
import { itemUpgradesQueryOptions } from "~/queries/asset-queries";
import {
  itemPermutationStatsQueryOptions,
  listableItemCombos,
  rankItemCombos,
  shopableItemIds,
} from "~/queries/item-permutation-query";

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
  const shopableIds = useMemo(() => shopableItemIds(assetsItems), [assetsItems]);

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
  const { data: itemCombData, isLoading } = useQuery(itemPermutationStatsQueryOptions(combStatsQuery));

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
    ...itemPermutationStatsQueryOptions(prevCombStatsQuery),
    enabled: hasPreviousInterval,
  });

  const filteredData = useMemo(() => listableItemCombos(itemCombData ?? [], shopableIds), [itemCombData, shopableIds]);
  const sortedData = useMemo(() => rankItemCombos(filteredData), [filteredData]);
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
    const prevRows = listableItemCombos(prevItemCombData, shopableIds);
    const prevSumMatches = prevRows.reduce((acc, row) => acc + row.matches, 0);
    const map = new Map<string, { winrate: number; share: number }>();
    for (const row of prevRows) {
      map.set(combKey(row.item_ids), {
        winrate: row.wins / row.matches,
        share: row.matches / prevSumMatches,
      });
    }
    return map;
  }, [prevItemCombData, shopableIds]);

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
                            color={CHART_COLOR.primary}
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
                            color={CHART_COLOR.pickRate}
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
