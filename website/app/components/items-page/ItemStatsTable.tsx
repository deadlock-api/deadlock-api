import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useMemo, useState } from "react";
import ItemImage from "~/components/ItemImage";
import ItemName from "~/components/ItemName";
import ItemTier from "~/components/ItemTier";
import { ProgressBarWithLabel } from "~/components/primitives/ProgressBar";
import ItemTierSelector from "~/components/selectors/ItemTierSelector";
import { Button } from "~/components/ui/button";
import { Label } from "~/components/ui/label";
import { Switch } from "~/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import type { Dayjs } from "~/dayjs";
import { type Serializer, serializers, useQSArray, useQSBoolean, useQSState } from "~/hooks/useQSState";
import { API_ORIGIN, ASSETS_ORIGIN } from "~/lib/constants";
import type { APIItemStats } from "~/types/api_item_stats";
import type { AssetsItem } from "~/types/assets_item";

type SortDirection = "asc" | "desc";
type SortField = "winRate" | "usage";

interface SortState {
  field: SortField;
  direction: SortDirection;
}

export interface ItemStatsTableDisplayProps {
  data: DisplayItemStats[] | undefined;
  isLoading: boolean;
  columns: string[];
  hideHeader?: boolean;
  hideIndex?: boolean;
  hideItemTierFilter?: boolean;
  minWinRate: number;
  maxWinRate: number;
  minUsage: number;
  maxUsage: number;
  includedItemIds: number[];
  excludedItemIds: number[];
  onItemInclude?: (item: number) => void;
  onItemExclude?: (item: number) => void;
  initialSort?: SortState;
  customDropdownContent?: ({
    itemId,
    rowWins,
    rowLosses,
    rowTotal,
  }: { itemId: number; rowWins: number; rowLosses: number; rowTotal: number }) => ReactNode;
}

export interface DisplayItemStats {
  item_id: number;
  wins: number;
  losses: number;
  matches: number;
  players: number;
  winRate: number;
  itemTier: number;
  confidenceTier: number;
  confidenceWidth: number;
  confidenceBaselineWidth: number;
  confidenceBaselineLower: number;
  confidenceBaselineUpper: number;
  confidenceUpper: number;
  confidenceLower: number;
}

interface ItemStatsTableRowProps {
  row: DisplayItemStats;
  index: number;
  columns: string[];
  hideIndex: boolean;
  dimLowConfidence: boolean;
  minWinRate: number;
  maxWinRate: number;
  minUsage: number;
  maxUsage: number;
  includedItemIds: number[];
  excludedItemIds: number[];
  onItemInclude?: (item: number) => void;
  onItemExclude?: (item: number) => void;
  customDropdownContent?: ({
    itemId,
    rowWins,
    rowLosses,
    rowTotal,
  }: { itemId: number; rowWins: number; rowLosses: number; rowTotal: number }) => ReactNode;
}

function wilsonScoreInterval(wins: number, matches: number, z = 1.96): [number, number] {
  if (matches === 0) return [0, 0];

  // Pre-calculate frequently used values
  const phat = wins / matches;
  const zSquared = z * z;
  const zSquaredOverMatches = zSquared / matches;
  const denominator = 1 + zSquaredOverMatches;

  // Combine operations where possible
  const center = phat + zSquaredOverMatches * 0.5;
  const margin = z * Math.sqrt((phat * (1 - phat) + zSquaredOverMatches * 0.25) / matches);

  // Return directly without intermediate variables
  return [(center - margin) / denominator, (center + margin) / denominator];
}

export function getDisplayItemStats(data: APIItemStats[] | undefined, assetsItems: AssetsItem[]): DisplayItemStats[] {
  if (!data || data.length === 0) return [];
  const baselineRow = data.reduce((max, d) => (d.matches > max.matches ? d : max), data[0]);
  const [baselineLower, baselineUpper] = wilsonScoreInterval(baselineRow.wins, baselineRow.matches);
  const baselineWidth = baselineUpper - baselineLower;

  return data.map((d): DisplayItemStats => {
    const item = assetsItems.find((i) => i.id === d.item_id);
    const [lower, upper] = wilsonScoreInterval(d.wins, d.matches);

    const width = upper - lower;
    const widthDiff = width - baselineWidth;
    let confidenceTier = 5;

    if (widthDiff > 0.15) confidenceTier = 1;
    else if (widthDiff > 0.1) confidenceTier = 2;
    else if (widthDiff > 0.07) confidenceTier = 3;
    else if (widthDiff > 0.02) confidenceTier = 4;

    return {
      ...d,
      winRate: d.wins / d.matches,
      itemTier: item?.item_tier || 0,
      confidenceTier: confidenceTier,
      confidenceWidth: width,
      confidenceBaselineWidth: baselineWidth,
      confidenceBaselineLower: baselineLower,
      confidenceBaselineUpper: baselineUpper,
      confidenceUpper: upper,
      confidenceLower: lower,
    };
  });
}

// Confidence tier is 1-5
// 1 is the worst, 5 is the best, from "Very low" to "Very high"
function ConfidenceTierBadge({ tier }: { tier: number }) {
  const getConfidenceLabel = (tier: number) => {
    switch (tier) {
      case 1:
        // Big warning, something more extreme than alert
        return <span className="icon-[mdi--alert-circle] h-4 w-4" />;
      case 3:
        // Question
        return <span className="icon-[mdi--help-circle] h-4 w-4" />;
      case 4:
        // Check
        return <span className="icon-[material-symbols--star-rounded] h-4 w-4" />;
      case 5:
        // Big check
        return (
          <div className="flex items-center gap-0.5">
            <span className="icon-[material-symbols--star-rounded] h-4 w-4" />
            <span className="icon-[material-symbols--star-rounded] h-4 w-4" />
          </div>
        );
      default:
        return <span className="icon-[mdi--help-circle] h-4 w-4" />;
    }
  };

  const getConfidenceColor = (tier: number) => {
    switch (tier) {
      case 1:
        return "bg-red-500/30 border-red-500 text-red-400";
      case 2:
      case 3:
        return "bg-yellow-500/30 border-yellow-500 text-yellow-400";
      case 4:
        return "bg-emerald-500/30 border-emerald-500 text-emerald-400";
      case 5:
        return "bg-emerald-500/30 border-emerald-500 text-emerald-400";
      default:
        return "bg-gray-500/30 border-gray-500 text-gray-400";
    }
  };

  return (
    <div className={`rounded-full px-3 py-1 text-xs font-semibold border ${getConfidenceColor(tier)}`}>
      {getConfidenceLabel(tier)}
    </div>
  );
}

function ItemStatsTableRow({
  row,
  index,
  columns,
  hideIndex,
  dimLowConfidence,
  minWinRate,
  maxWinRate,
  minUsage,
  maxUsage,
  includedItemIds,
  excludedItemIds,
  onItemInclude,
  onItemExclude,
  customDropdownContent,
}: ItemStatsTableRowProps) {
  const [open, setOpen] = useState(false);
  const shouldDim = dimLowConfidence && row.confidenceLower < row.confidenceBaselineLower;

  // Calculate total columns for colspan
  const totalColumns =
    (!hideIndex ? 1 : 0) + // Index column
    1 + // Item column (always present)
    (columns.includes("itemsTier") ? 1 : 0) +
    (columns.includes("winRate") ? 1 : 0) +
    (columns.includes("usage") ? 1 : 0) +
    (columns.includes("confidence") ? 1 : 0) +
    (onItemInclude || onItemExclude ? 1 : 0) +
    (customDropdownContent ? 1 : 0);

  return (
    <>
      <TableRow
        className={`bg-gray-900 border border-gray-800 hover:bg-gray-800 transition-all duration-200 cursor-pointer ${
          shouldDim ? "brightness-60" : ""
        }`}
        onClick={() => customDropdownContent && setOpen(!open)}
      >
        {!hideIndex && <TableCell className="font-semibold text-center">{index + 1}</TableCell>}
        <TableCell>
          <div className="flex items-center gap-2">
            {customDropdownContent && (
              <span className="p-0 h-auto">
                {open ? (
                  <span className="icon-[material-symbols--expand-less] w-4 h-4" />
                ) : (
                  <span className="icon-[material-symbols--expand-more] w-4 h-4" />
                )}
              </span>
            )}
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
        {columns.includes("confidence") && (
          <TableCell className="text-center">
            <div className="inline-flex">
              <ConfidenceTierBadge tier={row.confidenceTier} />
            </div>
          </TableCell>
        )}
        {(onItemInclude || onItemExclude) && (
          <TableCell width={130}>
            <div className="flex items-center justify-center gap-2">
              <Button
                variant="secondary"
                disabled={includedItemIds.includes(row.item_id)}
                className="bg-green-700 hover:bg-green-500 text-lg px-1 h-6 disabled:bg-gray-500"
                onClick={() => onItemInclude?.(row.item_id)}
              >
                <span className="icon-[mdi--plus]" />
              </Button>
              <Button
                variant="destructive"
                disabled={excludedItemIds.includes(row.item_id)}
                className="bg-red-700 hover:bg-red-500 px-1 h-6 disabled:bg-gray-500"
                onClick={() => onItemExclude?.(row.item_id)}
              >
                <span className="icon-[mdi--minus] text-lg" />
              </Button>
            </div>
          </TableCell>
        )}
      </TableRow>
      {customDropdownContent && open && (
        <TableRow>
          <TableCell colSpan={totalColumns} className="p-0 border-0">
            <div className="p-4 bg-gray-800 border-t border-gray-700">
              {customDropdownContent({
                itemId: row.item_id,
                rowWins: row.wins,
                rowLosses: row.losses,
                rowTotal: row.matches,
              })}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
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
  includedItemIds,
  excludedItemIds,
  onItemInclude,
  onItemExclude,
  initialSort = { field: "winRate", direction: "desc" },
  customDropdownContent,
}: ItemStatsTableDisplayProps) {
  const [sortField, setSortField] = useQSState<SortField>("item_sort_field", {
    defaultValue: initialSort.field,
    serializer: serializers.string as Serializer<SortField>,
  });
  const [sortDirection, setSortDirection] = useQSState<SortDirection>("item_sort_direction", {
    defaultValue: initialSort.direction,
    serializer: serializers.string as Serializer<SortDirection>,
  });

  const sort: SortState = useMemo(() => ({ field: sortField, direction: sortDirection }), [sortField, sortDirection]);
  const setSort = (sort: SortState) => {
    setSortField(sort.field);
    setSortDirection(sort.direction);
  };

  const [itemTiers, setItemTiers] = useQSArray("item_tiers", serializers.number, [1, 2, 3, 4]);
  const [dimLowConfidence, setDimLowConfidence] = useQSBoolean("dim_low_confidence", false);

  const processedData = useMemo(() => {
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
    let newSort: SortState;
    if (sort.field === field) {
      newSort = {
        ...sort,
        direction: sort.direction === "asc" ? "desc" : "asc",
      };
    } else {
      newSort = { field, direction: "desc" };
    }
    setSort(newSort);
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
      <div className="flex justify-center items-center gap-6 my-4">
        {!hideItemTierFilter && <ItemTierSelector onItemTiersSelected={setItemTiers} selectedItemTiers={itemTiers} />}
        {columns.includes("confidence") && (
          <div className="flex items-center gap-2">
            <Switch id="dim-low-confidence" checked={dimLowConfidence} onCheckedChange={setDimLowConfidence} />
            <Label htmlFor="dim-low-confidence" className="text-sm font-medium cursor-pointer">
              Highlight overperforming items
            </Label>
          </div>
        )}
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
              {columns.includes("confidence") && <TableHead className="text-center">Confidence</TableHead>}
              {(onItemInclude || onItemExclude) && <TableHead className="text-center">Include / Exclude</TableHead>}
            </TableRow>
          </TableHeader>
        )}
        <TableBody>
          {processedData
            .filter((row) => itemTiers.includes(row.itemTier))
            .map((row, index) => (
              <ItemStatsTableRow
                key={row.item_id}
                row={row}
                index={index}
                columns={columns}
                hideIndex={hideIndex}
                dimLowConfidence={dimLowConfidence}
                minWinRate={minWinRate}
                maxWinRate={maxWinRate}
                minUsage={minUsage}
                maxUsage={maxUsage}
                includedItemIds={includedItemIds}
                excludedItemIds={excludedItemIds}
                onItemInclude={onItemInclude}
                onItemExclude={onItemExclude}
                customDropdownContent={customDropdownContent}
              />
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
    queryFn: () => fetch(new URL("/v2/items/by-type/upgrade", ASSETS_ORIGIN)).then((res) => res.json()),
    staleTime: Number.POSITIVE_INFINITY,
  });

  const { data = [], isLoading: isLoadingItemStats } = useQuery<APIItemStats[]>({
    queryKey: ["api-item-stats", minMatches, hero, minRankId, maxRankId, minDateTimestamp, maxDateTimestamp, [], []],
    queryFn: async () => {
      const url = new URL("/v1/analytics/item-stats", API_ORIGIN);
      if (hero) url.searchParams.set("hero_id", hero.toString());
      url.searchParams.set("min_average_badge", (minRankId ?? 0).toString());
      url.searchParams.set("max_average_badge", (maxRankId ?? 116).toString());
      if (minDateTimestamp) url.searchParams.set("min_unix_timestamp", minDateTimestamp.toString());
      if (maxDateTimestamp) url.searchParams.set("max_unix_timestamp", maxDateTimestamp.toString());
      if (minMatches) url.searchParams.set("min_matches", minMatches.toString());
      const res = await fetch(url);
      const data = await res.json();
      if (Array.isArray(data)) return data;
      throw new Error("Error", { cause: data });
    },
    staleTime: 24 * 60 * 60 * 1000, // 24 hours
  });

  const minWinRate = useMemo(() => Math.min(...data.map((item) => item.wins / item.matches)), [data]);
  const maxWinRate = useMemo(() => Math.max(...data.map((item) => item.wins / item.matches)), [data]);
  const minUsage = useMemo(() => Math.min(...data.map((item) => item.matches)), [data]);
  const maxUsage = useMemo(() => Math.max(...data.map((item) => item.matches)), [data]);
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
  const displayData = useMemo(() => getDisplayItemStats(limitedData, assetsItems || []), [limitedData, assetsItems]);

  return (
    <ItemStatsTableDisplay
      data={displayData}
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
      includedItemIds={[]}
      excludedItemIds={[]}
    />
  );
}
