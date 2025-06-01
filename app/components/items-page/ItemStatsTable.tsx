import { useQuery } from "@tanstack/react-query";
import * as React from "react";
import { useMemo, useState } from "react";
import ItemImage from "~/components/ItemImage";
import ItemName from "~/components/ItemName";
import ItemTier from "~/components/ItemTier";
import { ProgressBarWithLabel } from "~/components/primitives/ProgressBar";
import ItemTierSelector from "~/components/selectors/ItemTierSelector";
import { Button } from "~/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import type { Dayjs } from "~/dayjs";
import type { APIItemStats } from "~/types/api_item_stats";
import type { AssetsItem } from "~/types/assets_item";

type SortDirection = "asc" | "desc";
type SortField = "winRate" | "usage";

interface SortState {
  field: SortField;
  direction: SortDirection;
}

export interface ItemStatsTableDisplayProps {
  data: APIItemStats[] | undefined;
  isLoading: boolean;
  columns: string[];
  hideHeader?: boolean;
  hideIndex?: boolean;
  hideItemTierFilter?: boolean;
  minWinRate: number;
  maxWinRate: number;
  minUsage: number;
  maxUsage: number;
  onItemInclude?: (item: number) => void;
  onItemExclude?: (item: number) => void;
  initialSort?: SortState;
}

export function ItemStatsTableDisplay({
  data,
  isLoading,
  columns,
  hideHeader = false,
  hideIndex = false,
  hideItemTierFilter = false,
  minWinRate,
  maxWinRate,
  minUsage,
  maxUsage,
  onItemInclude,
  onItemExclude,
  initialSort = { field: "winRate", direction: "desc" },
}: ItemStatsTableDisplayProps) {
  const [sort, setSort] = useState<SortState>(initialSort);
  const [itemTiers, setItemTiers] = useState<number[]>([1, 2, 3, 4]);

  const { data: assetsItems } = useQuery<AssetsItem[]>({
    queryKey: ["assets-items-upgrades"],
    queryFn: () => fetch("https://assets.deadlock-api.com/v2/items/by-type/upgrade").then((res) => res.json()),
    staleTime: Number.POSITIVE_INFINITY,
  });

  const itemTierMap = useMemo(() => {
    const map: Record<number, number> = {};
    for (const item of assetsItems || []) {
      map[item.id] = item.item_tier;
    }
    return map;
  }, [assetsItems]);

  const filteredData = useMemo(() => {
    if (!data) return [];
    return data.filter((d) => itemTiers.includes(itemTierMap[d.item_id]));
  }, [data, itemTiers, itemTierMap]);

  const sortedData = useMemo(() => {
    if (!filteredData) return [];
    return [...filteredData].sort((a, b) => {
      let aValue: number;
      let bValue: number;

      if (sort.field === "winRate") {
        aValue = a.wins / a.matches;
        bValue = b.wins / b.matches;
      } else if (sort.field === "usage") {
        aValue = a.matches;
        bValue = b.matches;
      } else {
        return 0;
      }

      return sort.direction === "asc" ? aValue - bValue : bValue - aValue;
    });
  }, [filteredData, sort]);

  const toggleSort = (field: SortField) => {
    setSort((prev) => {
      if (prev.field === field) {
        return {
          ...prev,
          direction: prev.direction === "asc" ? "desc" : "asc",
        };
      }
      return { field, direction: "desc" };
    });
  };

  // Arrow indicator for sort direction
  const getSortArrow = (field: SortField) => {
    if (sort.field !== field) return null;
    return sort.direction === "asc" ? (
      <span className="ml-1 mb-0.5 icon-[material-symbols--arrow-upward]" />
    ) : (
      <span className="ml-1 mb-0.5 icon-[material-symbols--arrow-downward]" />
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center w-full h-full">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <div className="overflow-x-auto w-full">
      <div className="flex justify-center my-4">
        {!hideItemTierFilter && <ItemTierSelector onItemTiersSelected={setItemTiers} selectedItemTiers={itemTiers} />}
      </div>
      <Table className="w-full min-w-fit">
        {!hideHeader && (
          <TableHeader className="bg-gray-800">
            <TableRow>
              {!hideIndex && <TableHead className="text-center">#</TableHead>}
              <TableHead>Item</TableHead>
              {columns.includes("itemsTier") && <TableHead>Tier</TableHead>}
              {columns.includes("winRate") && (
                <TableHead
                  className="text-center cursor-pointer hover:bg-gray-700 transition-colors"
                  onClick={() => toggleSort("winRate")}
                >
                  <div className="flex items-center">
                    <span>Win Rate</span>
                    {getSortArrow("winRate")}
                  </div>
                </TableHead>
              )}
              {columns.includes("usage") && (
                <TableHead
                  className="text-center cursor-pointer hover:bg-gray-700 transition-colors"
                  onClick={() => toggleSort("usage")}
                >
                  <div className="flex items-center">
                    <span>Usage</span>
                    {getSortArrow("usage")}
                  </div>
                </TableHead>
              )}
              {(onItemInclude || onItemExclude) && <TableHead className="text-center">Include / Exclude</TableHead>}
            </TableRow>
          </TableHeader>
        )}
        <TableBody>
          {sortedData.map((row, index) => (
            <TableRow
              key={row.item_id}
              className={"bg-gray-900 border border-gray-800 hover:bg-gray-800 transition-all duration-200"}
            >
              {!hideIndex && <TableCell className="font-semibold text-center">{index + 1}</TableCell>}
              <TableCell>
                <div className="flex items-center gap-2">
                  <ItemImage itemId={row.item_id} />
                  <ItemName itemId={row.item_id} />
                </div>
              </TableCell>
              {columns.includes("itemsTier") && (
                <TableCell>
                  <div className="flex items-center gap-2">
                    <ItemTier itemId={row.item_id} />
                  </div>
                </TableCell>
              )}
              {columns.includes("winRate") && (
                <TableCell
                  className="text-center"
                  title={`${row.wins.toLocaleString()} wins / ${row.matches.toLocaleString()} matches`}
                >
                  <ProgressBarWithLabel
                    min={minWinRate}
                    max={maxWinRate}
                    value={row.wins / row.matches}
                    color={"#ff00ff"}
                    label={`${(Math.round((row.wins / row.matches) * 100 * 100) / 100).toFixed(2)}% `}
                  />
                </TableCell>
              )}
              {columns.includes("usage") && (
                <TableCell className="text-center" title={`${row.matches.toLocaleString()} matches`}>
                  <ProgressBarWithLabel
                    min={minUsage}
                    max={maxUsage}
                    value={row.matches}
                    color={"#00ffff"}
                    label={row.matches.toLocaleString()}
                  />
                </TableCell>
              )}
              {(onItemInclude || onItemExclude) && (
                <TableCell width={130}>
                  <div className="flex items-center justify-center gap-2">
                    <Button
                      variant="secondary"
                      className="bg-green-700 hover:bg-green-500 text-lg px-1 h-6"
                      onClick={() => onItemInclude?.(row.item_id)}
                    >
                      <span className="icon-[mdi--plus]" />
                    </Button>
                    <Button
                      variant="destructive"
                      className="bg-red-700 hover:bg-red-500 px-1 h-6"
                      onClick={() => onItemExclude?.(row.item_id)}
                    >
                      <span className="icon-[mdi--minus] text-lg" />
                    </Button>
                  </div>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default function ItemStatsTable({
  columns,
  limit,
  hideHeader,
  hideIndex,
  hideItemTierFilter,
  initialSort,
  minRankId,
  maxRankId,
  minDate,
  maxDate,
  hero,
  minMatches,
}: {
  columns: string[];
  limit?: number;
  hideHeader?: boolean;
  hideIndex?: boolean;
  hideItemTierFilter?: boolean;
  initialSort?: SortState;
  minRankId?: number;
  maxRankId?: number;
  minDate?: Dayjs;
  maxDate?: Dayjs;
  hero?: number | null;
  minMatches?: number | null;
}) {
  const minDateTimestamp = useMemo(() => minDate?.unix(), [minDate]);
  const maxDateTimestamp = useMemo(() => maxDate?.unix(), [maxDate]);

  const { data: assetsItems, isLoading: isLoadingItemAssets } = useQuery<AssetsItem[]>({
    queryKey: ["assets-items-upgrades"],
    queryFn: () => fetch("https://assets.deadlock-api.com/v2/items/by-type/upgrade").then((res) => res.json()),
    staleTime: Number.POSITIVE_INFINITY,
  });

  const { data, isLoading: isLoadingItemStats } = useQuery<APIItemStats[]>({
    queryKey: ["api-item-stats", minMatches, hero, minRankId, maxRankId, minDateTimestamp, maxDateTimestamp, [], []],
    queryFn: async () => {
      const url = new URL("https://api.deadlock-api.com/v1/analytics/item-stats");
      if (hero) url.searchParams.set("hero_id", hero.toString());
      url.searchParams.set("min_average_badge", (minRankId ?? 0).toString());
      url.searchParams.set("max_average_badge", (maxRankId ?? 116).toString());
      if (minDateTimestamp) url.searchParams.set("min_unix_timestamp", minDateTimestamp.toString());
      if (maxDateTimestamp) url.searchParams.set("max_unix_timestamp", maxDateTimestamp.toString());
      if (minMatches) url.searchParams.set("min_matches", minMatches.toString());
      const res = await fetch(url);
      return await res.json();
    },
    staleTime: 24 * 60 * 60 * 1000, // 24 hours
  });

  const minWinRate = useMemo(() => Math.min(...(data || []).map((item) => item.wins / item.matches)), [data]);
  const maxWinRate = useMemo(() => Math.max(...(data || []).map((item) => item.wins / item.matches)), [data]);
  const minUsage = useMemo(() => Math.min(...(data || []).map((item) => item.matches)), [data]);
  const maxUsage = useMemo(() => Math.max(...(data || []).map((item) => item.matches)), [data]);
  const filteredData = useMemo(
    () =>
      data?.filter((d) =>
        assetsItems
          ?.filter((i) => !i.disabled)
          .map((i) => i.id)
          .includes(d.item_id),
      ),
    [data, assetsItems],
  );
  // Note: We're not sorting here anymore as the ItemStatsTableDisplay component handles sorting internally
  const limitedData = useMemo(() => (limit ? filteredData?.slice(0, limit) : filteredData), [filteredData, limit]);

  return (
    <ItemStatsTableDisplay
      data={limitedData}
      isLoading={isLoadingItemStats || isLoadingItemAssets}
      columns={columns}
      initialSort={initialSort}
      hideHeader={hideHeader}
      hideIndex={hideIndex}
      hideItemTierFilter={hideItemTierFilter}
      minWinRate={minWinRate}
      maxWinRate={maxWinRate}
      minUsage={minUsage}
      maxUsage={maxUsage}
    />
  );
}
