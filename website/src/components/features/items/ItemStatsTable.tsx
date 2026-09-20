import type { Upgrade } from "deadlock_api_client";
import type { ItemStats } from "deadlock_api_client";
import { ListFilter } from "lucide-react";
import { parseAsArrayOf, parseAsInteger, parseAsStringLiteral, useQueryState } from "nuqs";
import { memo, type ReactNode, useCallback, useMemo, useState } from "react";

import { ItemCellFromAsset } from "~/components/domain/assets/ItemCell";
import { ItemImage } from "~/components/domain/assets/ItemImage";
import { ItemName } from "~/components/domain/assets/ItemName";
import { ITEM_SLOTS, ItemSlotSelector } from "~/components/domain/selectors/ItemSlotSelector";
import { ItemTierSelector } from "~/components/domain/selectors/ItemTierSelector";
import { ItemQuickSelectDialog } from "~/components/features/items/ItemQuickSelectDialog";
import { ExpandableRow, ExpandableRowToggle } from "~/components/patterns/data-table/ExpandableRow";
import { SortableHeader } from "~/components/patterns/data-table/SortableHeader";
import { FilterBar } from "~/components/patterns/filter-bar/FilterBar";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { StaleOverlay } from "~/components/patterns/states/StaleOverlay";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { TooltipHeader, TooltipStat, TooltipStats } from "~/components/ui/panel-tooltip";
import { ProgressBarWithLabel } from "~/components/ui/progress-bar";
import { SearchInput } from "~/components/ui/search-input";
import { Stack } from "~/components/ui/stack";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { formatPercent } from "~/lib/format";
import { parseAsSetOf } from "~/lib/nuqs-parsers";
import { wilsonScoreInterval } from "~/lib/wilson";

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
      variant={variant === "include" ? "positive-soft" : "negative-soft"}
      size="xs"
      onClick={() => onRemove(id)}
      aria-label={`Remove ${variant === "include" ? "included" : "excluded"} item`}
      className="group"
    >
      <ItemImage itemId={id} className="size-4 shrink-0" />
      <ItemName itemId={id} className="text-xs text-foreground" />
      <span className="icon-[mdi--close] size-3 text-muted-foreground group-hover:text-foreground" />
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
  item?: Upgrade;
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

export function getDisplayItemStats(data: ItemStats[] | undefined, assetsItems: Upgrade[]): DisplayItemStats[] {
  if (!data || data.length === 0) return [];
  const baselineRow = data.reduce((max, d) => (d.matches > max.matches ? d : max), data[0]);
  const [baselineLower, baselineUpper] = wilsonScoreInterval(baselineRow.wins, baselineRow.matches);
  const baselineWidth = baselineUpper - baselineLower;
  const itemsById = new Map(assetsItems.map((item) => [item.id, item]));

  return data.map((d): DisplayItemStats => {
    const item = itemsById.get(d.item_id);
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
      item,
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
          <span className="flex items-center gap-0.5">
            <span className="icon-[material-symbols--star-rounded] h-4 w-4" />
            <span className="icon-[material-symbols--star-rounded] h-4 w-4" />
          </span>
        );
      default:
        return <span className="icon-[mdi--help-circle] h-4 w-4" />;
    }
  };

  const variant = tier === 1 ? "negative" : tier === 2 || tier === 3 ? "warning" : tier >= 4 ? "positive" : "muted";

  return <Badge variant={variant}>{getConfidenceLabel(tier)}</Badge>;
}

const ItemStatsTableRow = memo(function ItemStatsTableRow({
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
  const shouldDim = dimLowConfidence && row.confidenceLower < row.confidenceBaselineLower;
  const itemName = row.item?.name ?? "Unknown Item";

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

  const cells = (
    <>
      {customDropdownContent && (
        <TableCell className="w-4 text-center">
          <ExpandableRowToggle label={`purchase analysis for ${itemName}`} />
        </TableCell>
      )}
      {!hideIndex && <TableCell className="text-center font-semibold">{index + 1}</TableCell>}
      <TableCell data-pinned>
        <ItemCellFromAsset item={row.item} linkToDetail className="max-w-44 sm:max-w-64" />
      </TableCell>
      {columns.includes("itemsTier") && (
        <TableCell>
          <div className="flex items-center gap-2">{row.item?.item_tier ?? "?"}</div>
        </TableCell>
      )}
      {columns.includes("winRate") && (
        <TableCell className="text-center">
          <ProgressBarWithLabel
            orientation="horizontal"
            min={minWinRate}
            max={maxWinRate}
            value={row.wins / row.matches}
            color="var(--primary)"
            label={`${formatPercent(row.wins / row.matches)} `}
            delta={
              prevStatsMap?.get(row.item_id) !== undefined
                ? row.wins / row.matches - prevStatsMap.get(row.item_id)!.winrate
                : undefined
            }
            tooltip={
              <>
                <TooltipHeader title={itemName} subtitle="Win rate" />
                <TooltipStats>
                  <TooltipStat label="Matches" value={row.matches.toLocaleString("en-US")} />
                  <TooltipStat label="Wins" value={row.wins.toLocaleString("en-US")} />
                  <TooltipStat label="Win rate" value={`${((row.wins / row.matches) * 100).toFixed(2)}%`} />
                  {prevStatsMap?.get(row.item_id) !== undefined && (
                    <TooltipStat
                      label="Previous"
                      value={`${(prevStatsMap.get(row.item_id)!.winrate * 100).toFixed(2)}%`}
                    />
                  )}
                </TooltipStats>
              </>
            }
          />
        </TableCell>
      )}
      {columns.includes("matches") && (
        <TableCell className="text-center">
          <ProgressBarWithLabel
            orientation="horizontal"
            min={minUsage}
            max={maxUsage}
            value={row.matches}
            color="var(--chart-4)"
            label={`${Math.round((row.matches / maxUsage) * 100).toFixed(0)}%`}
            delta={
              prevStatsMap?.get(row.item_id) !== undefined
                ? row.matches / maxUsage - prevStatsMap.get(row.item_id)!.normalizedPickrate
                : undefined
            }
            tooltip={
              <>
                <TooltipHeader title={itemName} subtitle="Pick rate" />
                <TooltipStats>
                  <TooltipStat label="Matches" value={row.matches.toLocaleString("en-US")} />
                  <TooltipStat label="Pick rate" value={`${((row.matches / maxUsage) * 100).toFixed(2)}%`} />
                  {prevStatsMap?.get(row.item_id) !== undefined && (
                    <TooltipStat
                      label="Previous"
                      value={`${(prevStatsMap.get(row.item_id)!.normalizedPickrate * 100).toFixed(2)}%`}
                    />
                  )}
                </TooltipStats>
              </>
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
            variant="positive-soft"
            size="icon-xs"
            disabled={isIncluded}
            aria-label={`Include ${itemName} in filter`}
            title={`Include ${itemName} in filter`}
            onClick={(e) => {
              e.stopPropagation();
              onItemInclude(row.item_id);
            }}
          >
            <span className="icon-[mdi--plus] size-4" />
          </Button>
          <Button
            variant="negative-soft"
            size="icon-xs"
            disabled={isExcluded}
            aria-label={`Exclude ${itemName} from filter`}
            title={`Exclude ${itemName} from filter`}
            onClick={(e) => {
              e.stopPropagation();
              onItemExclude(row.item_id);
            }}
          >
            <span className="icon-[mdi--minus] size-4" />
          </Button>
        </div>
      </TableCell>
    </>
  );

  if (!customDropdownContent) return <TableRow data-dimmed={shouldDim || undefined}>{cells}</TableRow>;

  return (
    <ExpandableRow
      data-dimmed={shouldDim || undefined}
      colSpan={totalColumns}
      details={
        // Keep chart contents out of the table's intrinsic column sizing, while allowing natural height.
        <div className="[contain:inline-size]">
          {customDropdownContent({
            itemId: row.item_id,
            rowWins: row.wins,
            rowLosses: row.losses,
            rowTotal: row.matches,
          })}
        </div>
      }
    >
      {cells}
    </ExpandableRow>
  );
});

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

  const [itemSlots, setItemSlots] = useQueryState(
    "item_slots",
    parseAsArrayOf(parseAsStringLiteral(ITEM_SLOTS)).withDefault([...ITEM_SLOTS]),
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
  const [nameQuery, setNameQuery] = useState("");

  const handleApply = (nextInclude: Set<number>, nextExclude: Set<number>) => {
    setIncludeItems(nextInclude);
    setExcludeItems(nextExclude);
  };

  const addInclude = useCallback(
    (id: number) => {
      const next = new Set(includeItems);
      next.add(id);
      setIncludeItems(next);
      if (excludeItems.has(id)) {
        const nextExclude = new Set(excludeItems);
        nextExclude.delete(id);
        setExcludeItems(nextExclude);
      }
    },
    [includeItems, excludeItems, setIncludeItems, setExcludeItems],
  );
  const addExclude = useCallback(
    (id: number) => {
      const next = new Set(excludeItems);
      next.add(id);
      setExcludeItems(next);
      if (includeItems.has(id)) {
        const nextInclude = new Set(includeItems);
        nextInclude.delete(id);
        setIncludeItems(nextInclude);
      }
    },
    [includeItems, excludeItems, setIncludeItems, setExcludeItems],
  );
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

  const nameTerm = nameQuery.trim().toLowerCase();

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

  return (
    <Stack gap={4} aria-live="polite" aria-busy={isLoading} className="pt-4">
      <ItemQuickSelectDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initialInclude={includeItems}
        initialExclude={excludeItems}
        onApply={handleApply}
      />
      <FilterBar variant="toolbar" title="Item filters" icon={ListFilter} aria-label="Item table controls">
        <div className="flex min-w-0 flex-wrap items-center gap-1">
          {Array.from(includeItems).map((id) => (
            <ItemChip key={`inc-${id}`} id={id} variant="include" onRemove={removeInclude} />
          ))}
          {Array.from(excludeItems).map((id) => (
            <ItemChip key={`exc-${id}`} id={id} variant="exclude" onRemove={removeExclude} />
          ))}
          <Button variant="subtle" size="xs" shape="pill" onClick={() => setDialogOpen(true)}>
            <span className="icon-[mdi--plus] size-3" />
            Add Items
          </Button>
        </div>
        {!hideItemTierFilter && (
          <>
            <SearchInput
              value={nameQuery}
              onValueChange={setNameQuery}
              placeholder="Filter by name…"
              aria-label="Filter items by name"
              size="sm"
              className="w-40"
            />
            <ItemSlotSelector orientation="horizontal" value={itemSlots} onValueChange={setItemSlots} />
            <ItemTierSelector orientation="horizontal" value={itemTiers} onValueChange={setItemTiers} />
          </>
        )}
        {/* NOTE: "Highlight overperforming items" toggle hidden for now — not very useful in its
            current form. May bring back later; if reviving, restore the Switch+Label toggle here
            plus the related `dim_low_confidence` useQueryState (see git history) and wire it
            through to `ItemStatsTableRow`'s `dimLowConfidence` prop. Delete this comment on revival. */}
      </FilterBar>
      {isLoading ? (
        <LoadingState label="item statistics" align="center" />
      ) : (
        <StaleOverlay active={isRefetching} label="item statistics">
          <Table aria-label="Item statistics" density="compact" className="tabular-nums">
            {!hideHeader && (
              <TableHeader tone="muted">
                <TableRow>
                  {customDropdownContent && (
                    <TableHead className="w-4 text-center">
                      <span className="sr-only">Details</span>
                    </TableHead>
                  )}
                  {!hideIndex && <TableHead className="text-center">#</TableHead>}
                  <TableHead data-pinned>Item</TableHead>
                  {columns.includes("itemsTier") && <TableHead>Tier</TableHead>}
                  {columns.includes("winRate") && (
                    <SortableHeader
                      label="Win Rate"
                      sortKey="winRate"
                      activeSortKey={sort.field}
                      sortDir={sort.direction}
                      onSort={toggleSort}
                      className="text-start"
                    />
                  )}
                  {columns.includes("matches") && (
                    <SortableHeader
                      label="Pick Rate"
                      sortKey="matches"
                      activeSortKey={sort.field}
                      sortDir={sort.direction}
                      onSort={toggleSort}
                      className="text-start"
                    />
                  )}
                  {columns.includes("confidence") && <TableHead className="text-center">Confidence</TableHead>}
                  <TableHead className="text-center">
                    <span className="icon-[mdi--filter-variant] inline-block size-4 align-middle text-muted-foreground" />
                    <span className="sr-only">Filter</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
            )}
            <TableBody>
              {processedData
                .filter(
                  (row) =>
                    itemTiers.includes(row.itemTier) &&
                    (!row.item || itemSlots.includes(row.item.item_slot_type)) &&
                    (!nameTerm || (row.item?.name ?? "").toLowerCase().includes(nameTerm)),
                )
                .map((row, index) => (
                  <ItemStatsTableRow
                    key={row.item_id}
                    row={row}
                    index={hideIndex ? 0 : index}
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
        </StaleOverlay>
      )}
    </Stack>
  );
}
