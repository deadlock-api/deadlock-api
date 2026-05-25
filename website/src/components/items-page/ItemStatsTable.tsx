import type { Upgrade } from "deadlock_api_client";
import type { ItemStats } from "deadlock_api_client";
import { parseAsArrayOf, parseAsInteger, parseAsStringLiteral, useQueryState } from "nuqs";
import { type ReactNode, useMemo, useState } from "react";

import { ItemImage } from "~/components/ItemImage";
import { ItemName } from "~/components/ItemName";
import { ItemQuickSelectDialog } from "~/components/items-page/ItemQuickSelectDialog";
import { ItemTier } from "~/components/ItemTier";
import { LoadingLogo } from "~/components/LoadingLogo";
import { ProgressBarWithLabel } from "~/components/primitives/ProgressBar";
import { ItemTierSelector } from "~/components/selectors/ItemTierSelector";
import { Button } from "~/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { parseAsSetOf } from "~/lib/nuqs-parsers";
import { cn } from "~/lib/utils";

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

const DEFAULT_SORT_STATE: SortState = { field: "winRate", direction: "desc" };

function ItemChip({
  id,
  variant,
  onRemove,
}: {
  id: number;
  variant: "include" | "exclude";
  onRemove: (id: number) => void;
}) {
  return (
    <Button
      variant="ghost"
      size="xs"
      onClick={() => onRemove(id)}
      aria-label={`Remove ${variant === "include" ? "included" : "excluded"} item`}
      className={cn(
        "group border px-1.5",
        variant === "include"
          ? "border-green-500/30 bg-green-500/10 hover:border-green-500/60 hover:bg-green-500/20"
          : "border-red-500/30 bg-red-500/10 hover:border-red-500/60 hover:bg-red-500/20",
      )}
    >
      <ItemImage itemId={id} className="size-4 shrink-0" />
      <ItemName itemId={id} className="text-xs" />
      <span className="icon-[mdi--close] size-3 text-muted-foreground transition-colors group-hover:text-foreground" />
    </Button>
  );
}

export interface ItemStatsTableProps {
  data: DisplayItemStats[] | undefined;
  isLoading: boolean;
  isRefetching?: boolean;
  columns: string[];
  hideHeader?: boolean;
  hideIndex?: boolean;
  hideItemTierFilter?: boolean;
  minWinRate: number;
  maxWinRate: number;
  minUsage: number;
  maxUsage: number;
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
  isIncluded: boolean;
  isExcluded: boolean;
  prevStatsMap?: Map<number, { winrate: number; pickrate: number; normalizedPickrate: number }>;
  onItemInclude: (item: number) => void;
  onItemExclude: (item: number) => void;
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

export function getDisplayItemStats(data: ItemStats[] | undefined, assetsItems: Upgrade[]): DisplayItemStats[] {
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
  const getConfidenceLabel = (t: number) => {
    switch (t) {
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

  const getConfidenceColor = (t: number) => {
    switch (t) {
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
      className={`flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold ${getConfidenceColor(tier)}`}
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
  isIncluded,
  isExcluded,
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
    1 + // Include/Exclude column (always present)
    (customDropdownContent ? 1 : 0);

  return (
    <>
      <TableRow
        className={`cursor-pointer ${shouldDim ? "brightness-60" : ""}`}
        onClick={() => customDropdownContent && setOpen(!open)}
      >
        {customDropdownContent && (
          <TableCell className="h-4 w-4 text-center font-semibold">
            <span className="h-auto p-0">
              {open ? (
                <span className="icon-[material-symbols--expand-less] h-4 w-4 align-middle" />
              ) : (
                <span className="icon-[material-symbols--expand-more] h-4 w-4 align-middle" />
              )}
            </span>
          </TableCell>
        )}
        {!hideIndex && <TableCell className="text-center font-semibold">{index + 1}</TableCell>}
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
          <TableCell className="text-center">
            <ProgressBarWithLabel
              min={minWinRate}
              max={maxWinRate}
              value={row.wins / row.matches}
              color={"#fa4454"}
              label={`${Math.round((row.wins / row.matches) * 100).toFixed(0)}% `}
              delta={
                prevStatsMap?.get(row.item_id) !== undefined
                  ? row.wins / row.matches - prevStatsMap.get(row.item_id)!.winrate
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
                  {prevStatsMap?.get(row.item_id) !== undefined && (
                    <div className="mt-0.5 flex justify-between gap-4 border-t border-border pt-1">
                      <span className="text-muted-foreground">Previous</span>
                      <span className="font-medium">{(prevStatsMap.get(row.item_id)!.winrate * 100).toFixed(2)}%</span>
                    </div>
                  )}
                </div>
              }
            />
          </TableCell>
        )}
        {columns.includes("matches") && (
          <TableCell className="text-center">
            <ProgressBarWithLabel
              min={minUsage}
              max={maxUsage}
              value={row.matches}
              color={"#22d3ee"}
              label={`${Math.round((row.matches / maxUsage) * 100).toFixed(0)}%`}
              delta={
                prevStatsMap?.get(row.item_id) !== undefined
                  ? row.matches / maxUsage - prevStatsMap.get(row.item_id)!.normalizedPickrate
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
                    <span className="font-medium">{((row.matches / maxUsage) * 100).toFixed(2)}%</span>
                  </div>
                  {prevStatsMap?.get(row.item_id) !== undefined && (
                    <div className="mt-0.5 flex justify-between gap-4 border-t border-border pt-1">
                      <span className="text-muted-foreground">Previous</span>
                      <span className="font-medium">
                        {(prevStatsMap.get(row.item_id)!.normalizedPickrate * 100).toFixed(2)}%
                      </span>
                    </div>
                  )}
                </div>
              }
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
        <TableCell width={130}>
          <div className="flex items-center justify-center gap-2">
            <Button
              variant="secondary"
              disabled={isIncluded}
              className="h-6 bg-green-700 px-1 text-lg hover:bg-green-500 disabled:bg-muted"
              onClick={(e) => {
                e.stopPropagation();
                onItemInclude(row.item_id);
              }}
            >
              <span className="icon-[mdi--plus]" />
            </Button>
            <Button
              variant="destructive"
              disabled={isExcluded}
              className="h-6 bg-red-700 px-1 hover:bg-red-500 disabled:bg-muted"
              onClick={(e) => {
                e.stopPropagation();
                onItemExclude(row.item_id);
              }}
            >
              <span className="icon-[mdi--minus] text-lg" />
            </Button>
          </div>
        </TableCell>
      </TableRow>
      {customDropdownContent && open && (
        <TableRow>
          <TableCell colSpan={totalColumns} className="border-0 p-0">
            <div className="border-t border-border bg-muted p-4">
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

export function ItemStatsTable({
  data,
  isLoading,
  isRefetching = false,
  columns,
  hideHeader = false,
  hideIndex = false,
  hideItemTierFilter = false,
  minWinRate,
  maxWinRate,
  minUsage,
  maxUsage,
  initialSort = DEFAULT_SORT_STATE,
  prevStatsMap,
  customDropdownContent,
}: ItemStatsTableProps) {
  const [sortField, setSortField] = useQueryState("item_sort_field", parseAsSortField.withDefault(initialSort.field));
  const [sortDirection, setSortDirection] = useQueryState(
    "item_sort_direction",
    parseAsSortDirection.withDefault(initialSort.direction),
  );

  const sort: SortState = useMemo(() => ({ field: sortField, direction: sortDirection }), [sortField, sortDirection]);
  const setSort = (newSort: SortState) => {
    setSortField(newSort.field);
    setSortDirection(newSort.direction);
  };

  const [itemTiers, setItemTiers] = useQueryState(
    "item_tiers",
    parseAsArrayOf(parseAsInteger).withDefault([1, 2, 3, 4]),
  );

  const [includeItems, setIncludeItems] = useQueryState(
    "include_items",
    parseAsSetOf(parseAsInteger).withDefault(new Set()),
  );
  const [excludeItems, setExcludeItems] = useQueryState(
    "exclude_items",
    parseAsSetOf(parseAsInteger).withDefault(new Set()),
  );
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleApply = (nextInclude: Set<number>, nextExclude: Set<number>) => {
    setIncludeItems(nextInclude);
    setExcludeItems(nextExclude);
  };

  const addInclude = (id: number) => {
    const next = new Set(includeItems);
    next.add(id);
    setIncludeItems(next);
    if (excludeItems.has(id)) {
      const nextExclude = new Set(excludeItems);
      nextExclude.delete(id);
      setExcludeItems(nextExclude);
    }
  };
  const addExclude = (id: number) => {
    const next = new Set(excludeItems);
    next.add(id);
    setExcludeItems(next);
    if (includeItems.has(id)) {
      const nextInclude = new Set(includeItems);
      nextInclude.delete(id);
      setIncludeItems(nextInclude);
    }
  };
  const removeInclude = (id: number) => {
    const next = new Set(includeItems);
    next.delete(id);
    setIncludeItems(next);
  };
  const removeExclude = (id: number) => {
    const next = new Set(excludeItems);
    next.delete(id);
    setExcludeItems(next);
  };

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
      <span className="mb-0.5 ml-1 icon-[material-symbols--arrow-upward]" />
    ) : (
      <span className="mb-0.5 ml-1 icon-[material-symbols--arrow-downward]" />
    );
  };

  return (
    <div aria-live="polite" aria-busy={isLoading}>
      <ItemQuickSelectDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initialInclude={includeItems}
        initialExclude={excludeItems}
        onApply={handleApply}
      />
      <div className="my-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex items-center gap-1.5">
            <span className="icon-[mdi--filter-variant] size-4 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">Item Filters</p>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-1">
            {Array.from(includeItems).map((id) => (
              <ItemChip key={`inc-${id}`} id={id} variant="include" onRemove={removeInclude} />
            ))}
            {Array.from(excludeItems).map((id) => (
              <ItemChip key={`exc-${id}`} id={id} variant="exclude" onRemove={removeExclude} />
            ))}
            <Button
              variant="ghost"
              size="xs"
              onClick={() => setDialogOpen(true)}
              className="rounded-full border border-dashed border-white/[0.15] px-2 text-muted-foreground hover:border-white/[0.3] hover:bg-white/[0.04] hover:text-foreground"
            >
              <span className="icon-[mdi--plus] size-3" />
              Add Items
            </Button>
          </div>
        </div>
        {!hideItemTierFilter && <ItemTierSelector onItemTiersSelected={setItemTiers} selectedItemTiers={itemTiers} />}
        {/* NOTE: "Highlight overperforming items" toggle hidden for now — not very useful in its
            current form. May bring back later; if reviving, restore the Switch+Label toggle here
            plus the related `dim_low_confidence` useQueryState (see git history) and wire it
            through to `ItemStatsTableRow`'s `dimLowConfidence` prop. Delete this comment on revival. */}
      </div>
      {isLoading ? (
        <div className="flex h-full w-full items-center justify-center py-16">
          <LoadingLogo />
        </div>
      ) : (
        <div className="relative">
          {isRefetching && (
            <div className="pointer-events-auto absolute inset-0 z-10 flex items-start justify-center bg-background/40 pt-24 backdrop-blur-[1px]">
              <LoadingLogo />
            </div>
          )}
          <div className={cn("transition-opacity", isRefetching && "pointer-events-none opacity-50")}>
            <Table>
              {!hideHeader && (
                <TableHeader className="bg-muted">
                  <TableRow>
                    {customDropdownContent && <TableHead className="w-4 text-center" />}
                    {!hideIndex && <TableHead className="text-center">#</TableHead>}
                    <TableHead>Item</TableHead>
                    {columns.includes("itemsTier") && <TableHead>Tier</TableHead>}
                    {columns.includes("winRate") && (
                      <TableHead
                        className="cursor-pointer text-center transition-colors hover:bg-accent"
                        onClick={() => toggleSort("winRate")}
                        aria-sort={
                          sort.field === "winRate" ? (sort.direction === "asc" ? "ascending" : "descending") : undefined
                        }
                      >
                        <div className="flex items-center">
                          <span>Win Rate</span>
                          {getSortArrow("winRate")}
                        </div>
                      </TableHead>
                    )}
                    {columns.includes("matches") && (
                      <TableHead
                        className="cursor-pointer text-center transition-colors hover:bg-accent"
                        onClick={() => toggleSort("matches")}
                        aria-sort={
                          sort.field === "matches" ? (sort.direction === "asc" ? "ascending" : "descending") : undefined
                        }
                      >
                        <div className="flex items-center">
                          <span>Pick Rate</span>
                          {getSortArrow("matches")}
                        </div>
                      </TableHead>
                    )}
                    {columns.includes("confidence") && <TableHead className="text-center">Confidence</TableHead>}
                    <TableHead className="text-center" aria-label="Include or exclude item from filters">
                      <span className="icon-[mdi--filter-variant] inline-block size-4 align-middle text-muted-foreground" />
                    </TableHead>
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
                      dimLowConfidence={false}
                      minWinRate={minWinRate}
                      maxWinRate={maxWinRate}
                      minUsage={minUsage}
                      maxUsage={maxUsage}
                      isIncluded={includeItems.has(row.item_id)}
                      isExcluded={excludeItems.has(row.item_id)}
                      prevStatsMap={prevStatsMap}
                      onItemInclude={addInclude}
                      onItemExclude={addExclude}
                      customDropdownContent={customDropdownContent}
                    />
                  ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
