import { useQuery } from "@tanstack/react-query";
import type { Dayjs } from "dayjs";
import { useMemo, useState } from "react";
import ItemImage from "~/components/ItemImage";
import ItemName from "~/components/ItemName";
import ItemTier from "~/components/ItemTier";
import { ProgressBarWithLabel } from "~/components/primitives/ProgressBar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
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
  minWinRate: number;
  maxWinRate: number;
  minMatches: number;
  maxMatches: number;
  initialSort?: SortState;
}

export function ItemStatsTableDisplay({
  data,
  isLoading,
  columns,
  hideHeader = false,
  hideIndex = false,
  minWinRate,
  maxWinRate,
  minMatches,
  maxMatches,
  initialSort = { field: "winRate", direction: "desc" },
}: ItemStatsTableDisplayProps) {
  const [sort, setSort] = useState<SortState>(initialSort);

  const sortedData = useMemo(() => {
    if (!data) return [];
    return [...data].sort((a, b) => {
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
  }, [data, sort]);

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
            </TableRow>
          </TableHeader>
        )}
        <TableBody>
          {sortedData.map((row, index) => (
            <TableRow
              key={row.item_id}
              className="bg-gray-900 border border-gray-800 hover:bg-gray-800 transition-all duration-200"
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
                    min={minMatches}
                    max={maxMatches}
                    value={row.matches}
                    color={"#00ffff"}
                    label={row.matches.toLocaleString()}
                  />
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
  sortBy,
  minRankId,
  maxRankId,
  minDate,
  maxDate,
  hero,
}: {
  columns: string[];
  limit?: number;
  hideHeader?: boolean;
  hideIndex?: boolean;
  sortBy?: keyof APIItemStats | "winrate";
  minRankId?: number;
  maxRankId?: number;
  minDate?: Dayjs;
  maxDate?: Dayjs;
  hero?: number | null;
}) {
  const minDateTimestamp = useMemo(() => minDate?.unix(), [minDate]);
  const maxDateTimestamp = useMemo(() => maxDate?.unix(), [maxDate]);

  const { data: assetsItems, isLoading: isLoadingItemAssets } = useQuery<AssetsItem[]>({
    queryKey: ["assets-items-upgrades"],
    queryFn: () => fetch("https://assets.deadlock-api.com/v2/items/by-type/upgrade").then((res) => res.json()),
    staleTime: Number.POSITIVE_INFINITY,
  });

  const { data, isLoading: isLoadingItemStats } = useQuery<APIItemStats[]>({
    queryKey: ["api-item-stats", hero, minRankId, maxRankId, minDateTimestamp, maxDateTimestamp],
    queryFn: async () => {
      const url = new URL("https://api.deadlock-api.com/v1/analytics/item-stats");
      if (hero) url.searchParams.set("hero_id", hero.toString());
      url.searchParams.set("min_average_badge", (minRankId ?? 0).toString());
      url.searchParams.set("max_average_badge", (maxRankId ?? 116).toString());
      if (minDateTimestamp) url.searchParams.set("min_unix_timestamp", minDateTimestamp.toString());
      if (maxDateTimestamp) url.searchParams.set("max_unix_timestamp", maxDateTimestamp.toString());
      const res = await fetch(url);
      return await res.json();
    },
    staleTime: 24 * 60 * 60 * 1000, // 24 hours
  });

  const minWinRate = useMemo(() => Math.min(...(data || []).map((item) => item.wins / item.matches)), [data]);
  const maxWinRate = useMemo(() => Math.max(...(data || []).map((item) => item.wins / item.matches)), [data]);
  const minMatches = useMemo(() => Math.min(...(data || []).map((item) => item.matches)), [data]);
  const maxMatches = useMemo(() => Math.max(...(data || []).map((item) => item.matches)), [data]);
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
      hideHeader={hideHeader}
      hideIndex={hideIndex}
      minWinRate={minWinRate}
      maxWinRate={maxWinRate}
      minMatches={minMatches}
      maxMatches={maxMatches}
    />
  );
}
