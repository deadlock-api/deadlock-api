import { useQuery } from "@tanstack/react-query";
import type { UpgradeV2 } from "assets_deadlock_api_client/api";
import type { ItemStats } from "deadlock_api_client";
import { parseAsArrayOf, parseAsBoolean, parseAsInteger, parseAsStringLiteral, useQueryState } from "nuqs";
import { type ReactNode, useId, useMemo, useState } from "react";
import ItemImage from "~/components/ItemImage";
import ItemName from "~/components/ItemName";
import ItemTier from "~/components/ItemTier";
import ItemBuyTimingChart from "~/components/items-page/ItemBuyTimingChart";
import { LoadingLogo } from "~/components/LoadingLogo";
import { ProgressBarWithLabel } from "~/components/primitives/ProgressBar";
import type { GameMode } from "~/components/selectors/GameModeSelector";
import ItemTierSelector from "~/components/selectors/ItemTierSelector";
import { Button } from "~/components/ui/button";
import { Label } from "~/components/ui/label";
import { Switch } from "~/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import type { Dayjs } from "~/dayjs";
import { api } from "~/lib/api";
import { assetsApi } from "~/lib/assets-api";
import type { ItemStatsQueryParams } from "~/queries/item-stats-query";

// Parsers for sort field and direction using nuqs string literal parser
const parseAsSortField = parseAsStringLiteral(["winRate", "matches"] as const);
const parseAsSortDirection = parseAsStringLiteral(["asc", "desc"] as const);

// Infer types from parsers
type SortField = "winRate" | "matches";
type SortDirection = "asc" | "desc";

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
  prevStatsMap?: Map<number, { winrate: number; pickrate: number; normalizedPickrate: number }>;
  customDropdownContent?: ({
    itemId,
    rowWins,
    rowLosses,
    rowTotal,
  }: {
    itemId: number;
    rowWins: number;
    rowLosses: number;
    rowTotal: number;
  }) => ReactNode;
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
  prevStatsMap?: Map<number, { winrate: number; pickrate: number; normalizedPickrate: number }>;
  onItemInclude?: (item: number) => void;
  onItemExclude?: (item: number) => void;
  customDropdownContent?: ({
    itemId,
    rowWins,
    rowLosses,
    rowTotal,
  }: {
    itemId: number;
    rowWins: number;
    rowLosses: number;
    rowTotal: number;
  }) => ReactNode;
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

export function getDisplayItemStats(data: ItemStats[] | undefined, assetsItems: UpgradeV2[]): DisplayItemStats[] {
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
        return "bg-muted/30 border-border text-muted-foreground";
    }
  };

  return (
    <div
      className={`rounded-full px-3 py-1.5 items-center flex text-xs font-semibold border ${getConfidenceColor(tier)}`}
    >
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
  prevStatsMap,
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
    (columns.includes("matches") ? 1 : 0) +
    (columns.includes("confidence") ? 1 : 0) +
    (onItemInclude || onItemExclude ? 1 : 0) +
    (customDropdownContent ? 1 : 0);

  return (
    <>
      <TableRow
        className={`cursor-pointer ${shouldDim ? "brightness-60" : ""}`}
        onClick={() => customDropdownContent && setOpen(!open)}
      >
        {customDropdownContent && (
          <TableCell className="font-semibold text-center w-4 h-4">
            <span className="p-0 h-auto">
              {open ? (
                <span className="icon-[material-symbols--expand-less] w-4 h-4 align-middle" />
              ) : (
                <span className="icon-[material-symbols--expand-more] w-4 h-4 align-middle" />
              )}
            </span>
          </TableCell>
        )}
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
              color={"#fa4454"}
              label={`${(Math.round((row.wins / row.matches) * 100)).toFixed(0)}% `}
              delta={prevStatsMap?.get(row.item_id) !== undefined
                ? (row.wins / row.matches) - prevStatsMap.get(row.item_id)!.winrate
                : undefined}
            />
          </TableCell>
        )}
        {columns.includes("matches") && (
          <TableCell className="text-center" title={`${row.matches.toLocaleString()} matches`}>
            <ProgressBarWithLabel
              min={minUsage}
              max={maxUsage}
              value={row.matches}
              color={"#22d3ee"}
              label={row.matches.toLocaleString()}
              delta={prevStatsMap?.get(row.item_id) !== undefined
                ? (row.matches / maxUsage) - prevStatsMap.get(row.item_id)!.normalizedPickrate
                : undefined}
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
                className="bg-green-700 hover:bg-green-500 text-lg px-1 h-6 disabled:bg-muted"
                onClick={() => onItemInclude?.(row.item_id)}
              >
                <span className="icon-[mdi--plus]" />
              </Button>
              <Button
                variant="destructive"
                disabled={excludedItemIds.includes(row.item_id)}
                className="bg-red-700 hover:bg-red-500 px-1 h-6 disabled:bg-muted"
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
            <div className="p-4 bg-muted border-t border-border">
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
  initialSort = { field: "winRate" as SortField, direction: "desc" as SortDirection },
  prevStatsMap,
  customDropdownContent,
}: ItemStatsTableDisplayProps) {
  const [sortField, setSortField] = useQueryState("item_sort_field", parseAsSortField.withDefault(initialSort.field));
  const [sortDirection, setSortDirection] = useQueryState(
    "item_sort_direction",
    parseAsSortDirection.withDefault(initialSort.direction),
  );

  const sort: SortState = useMemo(() => ({ field: sortField, direction: sortDirection }), [sortField, sortDirection]);
  const setSort = (sort: SortState) => {
    setSortField(sort.field);
    setSortDirection(sort.direction);
  };

  const [itemTiers, setItemTiers] = useQueryState(
    "item_tiers",
    parseAsArrayOf(parseAsInteger).withDefault([1, 2, 3, 4]),
  );
  const [dimLowConfidence, setDimLowConfidence] = useQueryState(
    "dim_low_confidence",
    parseAsBoolean.withDefault(false),
  );
  const dimLowConfidenceId = useId();

  const processedData = useMemo(() => {
    if (!data) return [];
    return [...data].sort((a, b) => {
      let aValue: number;
      let bValue: number;

      if (sort.field === "winRate") {
        aValue = a.wins / a.matches;
        bValue = b.wins / b.matches;
      } else if (sort.field === "matches") {
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
      <div className="flex items-center justify-center w-full h-full py-16">
        <LoadingLogo />
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-center items-center gap-6 my-4">
        {!hideItemTierFilter && <ItemTierSelector onItemTiersSelected={setItemTiers} selectedItemTiers={itemTiers} />}
        {columns.includes("confidence") && (
          <div className="flex items-center gap-2">
            <Switch id={dimLowConfidenceId} checked={dimLowConfidence} onCheckedChange={setDimLowConfidence} />
            <Label htmlFor={dimLowConfidenceId} className="text-sm font-medium cursor-pointer">
              Highlight overperforming items
            </Label>
          </div>
        )}
      </div>
      <Table>
        {!hideHeader && (
          <TableHeader className="bg-muted">
            <TableRow>
              {customDropdownContent && <TableHead className="text-center w-4" />}
              {!hideIndex && <TableHead className="text-center">#</TableHead>}
              <TableHead>Item</TableHead>
              {columns.includes("itemsTier") && <TableHead>Tier</TableHead>}
              {columns.includes("winRate") && (
                <TableHead
                  className="text-center cursor-pointer hover:bg-accent transition-colors"
                  onClick={() => toggleSort("winRate")}
                >
                  <div className="flex items-center">
                    <span>Win Rate</span>
                    {getSortArrow("winRate")}
                  </div>
                </TableHead>
              )}
              {columns.includes("matches") && (
                <TableHead
                  className="text-center cursor-pointer hover:bg-accent transition-colors"
                  onClick={() => toggleSort("matches")}
                >
                  <div className="flex items-center">
                    <span>Matches</span>
                    {getSortArrow("matches")}
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
                prevStatsMap={prevStatsMap}
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
  hideDropdown,
  hideItemTierFilter,
  initialSort,
  minRankId,
  maxRankId,
  minDate,
  maxDate,
  hero,
  minMatches,
  minBoughtAtS,
  maxBoughtAtS,
  gameMode,
}: {
  columns: string[];
  limit?: number;
  hideHeader?: boolean;
  hideIndex?: boolean;
  hideDropdown?: boolean;
  hideItemTierFilter?: boolean;
  initialSort?: SortState;
  minRankId?: number;
  maxRankId?: number;
  minDate?: Dayjs;
  maxDate?: Dayjs;
  hero?: number | null;
  minMatches?: number | null;
  minBoughtAtS?: number;
  maxBoughtAtS?: number;
  gameMode?: GameMode;
}) {
  const minDateTimestamp = useMemo(() => minDate?.unix() ?? 0, [minDate]);
  const maxDateTimestamp = useMemo(() => maxDate?.unix(), [maxDate]);

  const hasPreviousInterval = minDateTimestamp > 0 && maxDateTimestamp !== undefined;
  const prevMinTimestamp = useMemo(
    () => (hasPreviousInterval ? minDateTimestamp - (maxDateTimestamp - minDateTimestamp) : 0),
    [hasPreviousInterval, minDateTimestamp, maxDateTimestamp],
  );
  const prevMaxTimestamp = useMemo(
    () => (hasPreviousInterval ? minDateTimestamp : undefined),
    [hasPreviousInterval, minDateTimestamp],
  );

  const { data: assetsItems, isLoading: isLoadingItemAssets } = useQuery({
    queryKey: ["assets-items-upgrades"],
    queryFn: async () => {
      const response = await assetsApi.items_api.getItemsByTypeV2ItemsByTypeTypeGet({ type: "upgrade" });
      return response.data as UpgradeV2[];
    },
    staleTime: Number.POSITIVE_INFINITY,
  });

  const { data = [], isLoading: isLoadingItemStats } = useQuery({
    queryKey: [
      "api-item-stats",
      minMatches,
      hero,
      minRankId,
      maxRankId,
      minDateTimestamp,
      maxDateTimestamp,
      minBoughtAtS,
      maxBoughtAtS,
      gameMode,
    ],
    queryFn: async () => {
      const response = await api.analytics_api.itemStats({
        heroId: hero,
        minAverageBadge: minRankId ?? 0,
        maxAverageBadge: maxRankId ?? 116,
        minUnixTimestamp: minDateTimestamp,
        maxUnixTimestamp: maxDateTimestamp,
        minMatches: minMatches,
        minBoughtAtS: minBoughtAtS,
        maxBoughtAtS: maxBoughtAtS,
        gameMode,
      });
      return response.data;
    },
    staleTime: 24 * 60 * 60 * 1000, // 24 hours
  });

  const { data: prevData } = useQuery({
    queryKey: [
      "api-item-stats",
      minMatches,
      hero,
      minRankId,
      maxRankId,
      prevMinTimestamp,
      prevMaxTimestamp,
      minBoughtAtS,
      maxBoughtAtS,
      gameMode,
    ],
    queryFn: async () => {
      const response = await api.analytics_api.itemStats({
        heroId: hero,
        minAverageBadge: minRankId ?? 0,
        maxAverageBadge: maxRankId ?? 116,
        minUnixTimestamp: prevMinTimestamp,
        maxUnixTimestamp: prevMaxTimestamp,
        minMatches: minMatches,
        minBoughtAtS: minBoughtAtS,
        maxBoughtAtS: maxBoughtAtS,
        gameMode,
      });
      return response.data;
    },
    staleTime: 24 * 60 * 60 * 1000,
    enabled: hasPreviousInterval,
  });

  const prevStatsMap = useMemo(() => {
    if (!prevData) return undefined;
    const prevSumMatches = prevData.reduce((acc, row) => acc + row.matches, 0);
    const prevMaxMatches = Math.max(...prevData.map((item) => item.matches));
    const map = new Map<number, { winrate: number; pickrate: number; normalizedPickrate: number }>();
    for (const row of prevData) {
      map.set(row.item_id, {
        winrate: row.wins / row.matches,
        pickrate: row.matches / prevSumMatches,
        normalizedPickrate: row.matches / prevMaxMatches,
      });
    }
    return map;
  }, [prevData]);

  const minWinRate = useMemo(() => Math.min(...data.map((item) => item.wins / item.matches)), [data]);
  const maxWinRate = useMemo(() => Math.max(...data.map((item) => item.wins / item.matches)), [data]);
  const minUsage = useMemo(() => Math.min(...data.map((item) => item.matches)), [data]);
  const maxUsage = useMemo(() => Math.max(...data.map((item) => item.matches)), [data]);
  const filteredData = useMemo(
    () =>
      data?.filter((d) =>
        assetsItems
          ?.filter((i) => !i.disabled && i.shopable && i.shop_image_webp)
          .map((i) => i.id)
          .includes(d.item_id),
      ),
    [data, assetsItems],
  );
  // Note: We're not sorting here anymore as the ItemStatsTableDisplay component handles sorting internally
  const limitedData = useMemo(() => (limit ? filteredData?.slice(0, limit) : filteredData), [filteredData, limit]);
  const displayData = useMemo(() => getDisplayItemStats(limitedData, assetsItems || []), [limitedData, assetsItems]);

  const queryStatOptions = useMemo(() => {
    return {
      minMatches,
      hero,
      minRankId,
      maxRankId,
      minDateTimestamp,
      maxDateTimestamp,
      bucket: undefined,
      gameMode,
    } satisfies ItemStatsQueryParams;
  }, [minMatches, hero, minRankId, maxRankId, minDateTimestamp, maxDateTimestamp, gameMode]);

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
      prevStatsMap={prevStatsMap}
      includedItemIds={[]}
      excludedItemIds={[]}
      customDropdownContent={
        !hideDropdown
          ? ({ itemId, rowTotal }) => (
              <ItemBuyTimingChart itemIds={[itemId]} baseQueryOptions={queryStatOptions} rowTotalMatches={rowTotal} />
            )
          : undefined
      }
    />
  );
}
