import type { Upgrade } from "deadlock_api_client";
import type { AnalyticsApiItemStatsRequest, ItemStats } from "deadlock_api_client";
import { Table2 } from "lucide-react";
import { parseAsArrayOf, parseAsInteger, parseAsStringLiteral, useQueryState } from "nuqs";
import { memo, type ReactNode, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

import { ItemCell } from "~/components/domain/assets/ItemCell";
import { ItemSelector } from "~/components/domain/selectors/ItemSelector";
import { ITEM_SLOTS, ItemSlotSelector } from "~/components/domain/selectors/ItemSlotSelector";
import { ItemTierSelector } from "~/components/domain/selectors/ItemTierSelector";
import { ItemStatTrend } from "~/components/features/items/ItemStatTrend";
import type { StatTrendBucket } from "~/components/patterns/charts/StatTrendChart";
import { ExpandableRow, ExpandableRowToggle } from "~/components/patterns/data-table/ExpandableRow";
import { SortableHeader } from "~/components/patterns/data-table/SortableHeader";
import { FilterBar } from "~/components/patterns/filter-bar/FilterBar";
import type { TriState } from "~/components/patterns/filter-bar/TriStateSelector";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { StaleOverlay } from "~/components/patterns/states/StaleOverlay";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { SearchInput } from "~/components/ui/search-input";
import { Stack } from "~/components/ui/stack";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { Tooltip, TooltipHeader, TooltipStat, TooltipStats, TooltipTarget } from "~/components/ui/tooltip";
import { formatPercent } from "~/lib/format";
import { parseAsSetOf } from "~/lib/nuqs-parsers";
import { cn } from "~/lib/utils";
import { wilsonScoreInterval } from "~/lib/wilson";

// Parsers for sort field and direction using nuqs string literal parser
const parseAsSortField = parseAsStringLiteral(["winRate", "matches", "name", "tier"] as const);
const parseAsSortDirection = parseAsStringLiteral(["asc", "desc"] as const);

// Infer types from parsers
type SortField = "winRate" | "matches" | "name" | "tier";
type SortDirection = "asc" | "desc";

interface SortState {
  field: SortField;
  direction: SortDirection;
}

const DEFAULT_SORT_STATE: SortState = { field: "winRate", direction: "desc" };

function toggled(set: Set<number>, id: number) {
  const next = new Set(set);
  if (!next.delete(id)) next.add(id);
  return next;
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
  /** Controls that sit at the end of the toolbar. */
  actions?: ReactNode;
  /** The request behind `data`: hovering a win rate charts that item's win rate over time from it. */
  trendParams: AnalyticsApiItemStatsRequest;
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
  trendParams: AnalyticsApiItemStatsRequest;
  trendBucket: StatTrendBucket;
  onTrendBucketChange: (bucket: StatTrendBucket) => void;
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
const CONFIDENCE_NAMES: Record<number, string> = {
  1: "Very low",
  2: "Low",
  3: "Moderate",
  4: "High",
  5: "Very high",
};

/** The confidence mark of an item row; its tooltip says what the mark rests on. */
function ConfidenceTierBadge({ row }: { row: DisplayItemStats }) {
  const tier = row.confidenceTier;
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

  const name = CONFIDENCE_NAMES[tier] ?? "Unknown";
  const percent = (value: number) => `${(value * 100).toFixed(1)}%`;

  return (
    <Tooltip
      content={
        <>
          <TooltipHeader title={`${name} confidence`} />
          <TooltipStats>
            <TooltipStat label="Win rate" value={percent(row.winRate)} />
            <TooltipStat
              label="95% range"
              value={`${percent(row.confidenceLower)} to ${percent(row.confidenceUpper)}`}
            />
            <TooltipStat label="Matches" value={row.matches.toLocaleString("en-US")} />
          </TooltipStats>
          <p className="max-w-64 text-xs text-muted-foreground">
            How far the true win rate could sit from the one shown, given the matches behind it: the narrower the range
            compared with the most bought item's, the higher the confidence.
          </p>
        </>
      }
    >
      <TooltipTarget aria-label={`${name} confidence`}>
        <Badge variant={variant}>{getConfidenceLabel(tier)}</Badge>
      </TooltipTarget>
    </Tooltip>
  );
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
  trendParams,
  trendBucket,
  onTrendBucketChange,
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
      {!hideIndex && <TableCell className="hidden text-center font-semibold @md:table-cell">{index + 1}</TableCell>}
      <TableCell data-pinned>
        <Stack gap={1}>
          <ItemCell item={row.item} linkToDetail className="max-w-44 sm:max-w-64" />
          <p className="text-xs text-muted-foreground tabular-nums">{row.matches.toLocaleString("en-US")} matches</p>
        </Stack>
      </TableCell>
      {columns.includes("itemsTier") && (
        <TableCell className="hidden @md:table-cell">
          <div className="flex items-center gap-2">{row.item?.item_tier ?? "?"}</div>
        </TableCell>
      )}
      {columns.includes("winRate") && (
        <TableCell>
          <ItemStatTrend
            params={trendParams}
            itemId={row.item_id}
            itemName={itemName}
            stat="winRate"
            bucket={trendBucket}
            onBucketChange={onTrendBucketChange}
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
          />
        </TableCell>
      )}
      {columns.includes("matches") && (
        <TableCell>
          <ItemStatTrend
            params={trendParams}
            itemId={row.item_id}
            itemName={itemName}
            stat="pickRate"
            bucket={trendBucket}
            onBucketChange={onTrendBucketChange}
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
          />
        </TableCell>
      )}
      {columns.includes("confidence") && (
        <TableCell className="hidden text-center @md:table-cell">
          <div className="inline-flex">
            <ConfidenceTierBadge row={row} />
          </div>
        </TableCell>
      )}
      <TableCell width={130}>
        <div className="flex items-center justify-center gap-2">
          {/* Toggles rather than buttons that disable themselves: a disabled button drops the keyboard focus to the
              page, and pressing it again is the quickest way to take the item back out of the filter. */}
          <Button
            variant="positive-soft"
            size="icon-xs"
            aria-pressed={isIncluded}
            aria-label={`Include ${itemName} in filter`}
            title={isIncluded ? `Stop including ${itemName}` : `Include ${itemName} in filter`}
            onClick={(e) => {
              e.stopPropagation();
              onItemInclude(row.item_id);
            }}
          >
            <span className={cn(isIncluded ? "icon-[mdi--check]" : "icon-[mdi--plus]", "size-4")} />
          </Button>
          <Button
            variant="negative-soft"
            size="icon-xs"
            aria-pressed={isExcluded}
            aria-label={`Exclude ${itemName} from filter`}
            title={isExcluded ? `Stop excluding ${itemName}` : `Exclude ${itemName} from filter`}
            onClick={(e) => {
              e.stopPropagation();
              onItemExclude(row.item_id);
            }}
          >
            <span className={cn(isExcluded ? "icon-[mdi--close]" : "icon-[mdi--minus]", "size-4")} />
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
  actions,
  trendParams,
  prevStatsMap,
  customDropdownContent,
}: ItemStatsTableProps) {
  const [trendBucket, setTrendBucket] = useState<StatTrendBucket>("start_time_day");
  const [sortField, setSortField] = useQueryState("item_sort_field", parseAsSortField.withDefault(initialSort.field));
  const [sortDirection, setSortDirection] = useQueryState(
    "item_sort_direction",
    parseAsSortDirection.withDefault(initialSort.direction),
  );

  const sort: SortState = useMemo(() => ({ field: sortField, direction: sortDirection }), [sortField, sortDirection]);
  const setSort = (newSort: SortState) => {
    void setSortField(newSort.field);
    void setSortDirection(newSort.direction);
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
  const [nameQuery, setNameQuery] = useState("");

  // The toolbar's item filter holds both lists as one include / exclude map; the rows' toggles below edit the same
  // two URL lists.
  const itemStates = useMemo(
    () =>
      new Map<number, TriState>([
        ...[...includeItems].map((id): [number, TriState] => [id, "included"]),
        ...[...excludeItems].map((id): [number, TriState] => [id, "excluded"]),
      ]),
    [includeItems, excludeItems],
  );
  const setItemStates = (next: Map<number, TriState>) => {
    const ids = (state: TriState) => new Set([...next].filter(([, s]) => s === state).map(([id]) => id));
    void setIncludeItems(ids("included"));
    void setExcludeItems(ids("excluded"));
  };

  // Functional updates keep both callbacks stable, so a click re-renders one memoized row instead of the whole table.
  // An exclusion (or an inclusion the item fails) can take the row, and with it the focused toggle, off the table once
  // the new stats arrive. Focus then moves to the item filter in the toolbar instead of falling to the page.
  const itemFilterRef = useRef<HTMLDivElement>(null);
  const lastToggled = useRef<number | null>(null);

  // Pressing an item's include (or exclude) toggle again takes it back out of that list.
  const toggleInclude = useCallback(
    (id: number) => {
      lastToggled.current = id;
      void setIncludeItems((prev) => toggled(prev, id));
      void setExcludeItems((prev) => (prev.has(id) ? new Set([...prev].filter((other) => other !== id)) : prev));
    },
    [setIncludeItems, setExcludeItems],
  );
  const toggleExclude = useCallback(
    (id: number) => {
      lastToggled.current = id;
      void setExcludeItems((prev) => toggled(prev, id));
      void setIncludeItems((prev) => (prev.has(id) ? new Set([...prev].filter((other) => other !== id)) : prev));
    },
    [setIncludeItems, setExcludeItems],
  );

  // The header and filters answer a click at once; the ~150 rows (a few hundred ms of style and layout on a phone)
  // follow in a deferred render, marked busy until they catch up.
  const rowSort = useDeferredValue(sort);
  const rowTiers = useDeferredValue(itemTiers);
  const rowSlots = useDeferredValue(itemSlots);
  const rowsCatchingUp = rowSort !== sort || rowTiers !== itemTiers || rowSlots !== itemSlots;

  const processedData = useMemo(() => {
    if (!data) return [];
    return [...data].sort((a, b) => {
      let aValue: number;
      let bValue: number;

      if (rowSort.field === "name") {
        const byName = (a.item?.name ?? "").localeCompare(b.item?.name ?? "");
        return rowSort.direction === "asc" ? byName : -byName;
      }
      if (rowSort.field === "tier") {
        // Within a tier, the stronger item first, whichever way the tiers run.
        const byTier = rowSort.direction === "asc" ? a.itemTier - b.itemTier : b.itemTier - a.itemTier;
        return byTier || b.wins / b.matches - a.wins / a.matches;
      }
      if (rowSort.field === "winRate") {
        aValue = a.wins / a.matches;
        bValue = b.wins / b.matches;
      } else if (rowSort.field === "matches") {
        aValue = a.matches;
        bValue = b.matches;
      } else {
        return 0;
      }

      return rowSort.direction === "asc" ? aValue - bValue : bValue - aValue;
    });
  }, [data, rowSort]);

  // Echo keystrokes before filtering and rendering the rows.
  const nameTerm = useDeferredValue(nameQuery).trim().toLowerCase();

  const visibleData = processedData.filter(
    (row) =>
      (rowTiers.length === 0 || rowTiers.includes(row.itemTier)) &&
      (rowSlots.length === 0 || !row.item || rowSlots.includes(row.item.item_slot_type)) &&
      (!nameTerm || (row.item?.name ?? "").toLowerCase().includes(nameTerm)),
  );

  useEffect(() => {
    const id = lastToggled.current;
    if (id === null || visibleData.some((row) => row.item_id === id)) return;
    lastToggled.current = null;
    if (document.activeElement !== document.body) return;
    itemFilterRef.current?.querySelector<HTMLElement>('[data-slot="popover-trigger"]')?.focus();
  });

  const toggleSort = (field: SortField) => {
    let newSort: SortState;
    if (sort.field === field) {
      newSort = {
        ...sort,
        direction: sort.direction === "asc" ? "desc" : "asc",
      };
    } else {
      // Names and tiers read from the top down (A first, tier 1 first); numbers from the largest.
      newSort = { field, direction: field === "name" || field === "tier" ? "asc" : "desc" };
    }
    setSort(newSort);
  };

  return (
    // Not a live region: it holds the whole table, which a screen reader would then read out on every sort.
    <Stack gap={4} aria-busy={isLoading}>
      <FilterBar variant="toolbar" title="Overall stats" icon={Table2} aria-label="Item table controls">
        <ItemSelector
          ref={itemFilterRef}
          selection="tri-state"
          size="sm"
          value={itemStates}
          onValueChange={setItemStates}
        />
        {!hideItemTierFilter && (
          <>
            <SearchInput
              value={nameQuery}
              onValueChange={setNameQuery}
              placeholder="Filter by name…"
              aria-label="Filter items by name"
              size="sm"
              className="w-full sm:w-60"
            />
            <ItemSlotSelector orientation="horizontal" value={itemSlots} onValueChange={setItemSlots} />
            <ItemTierSelector orientation="horizontal" value={itemTiers} onValueChange={setItemTiers} />
          </>
        )}
        {actions}
        {/* NOTE: "Highlight overperforming items" toggle hidden for now — not very useful in its
            current form. May bring back later; if reviving, restore the Switch+Label toggle here
            plus the related `dim_low_confidence` useQueryState (see git history) and wire it
            through to `ItemStatsTableRow`'s `dimLowConfidence` prop. Delete this comment on revival. */}
      </FilterBar>
      {isLoading ? (
        <LoadingState label="item statistics" align="center" />
      ) : (
        <StaleOverlay active={isRefetching} label="item statistics">
          {/* A size container, so a phone drops the rank, tier and confidence columns (row order is the rank, the tier
              a filter above) and keeps the win rate, which the table is sorted by, on screen. */}
          <div className="@container">
            <Table aria-label="Item statistics" className="tabular-nums">
              {!hideHeader && (
                <TableHeader tone="muted">
                  <TableRow>
                    {customDropdownContent && (
                      <TableHead className="w-4 text-center">
                        <span className="sr-only">Details</span>
                      </TableHead>
                    )}
                    {!hideIndex && <TableHead className="hidden text-center @md:table-cell">#</TableHead>}
                    <SortableHeader
                      label="Item"
                      sortKey="name"
                      activeSortKey={sort.field}
                      sortDir={sort.direction}
                      onSortChange={toggleSort}
                      className="text-start"
                      data-pinned
                    />
                    {columns.includes("itemsTier") && (
                      <SortableHeader
                        label="Tier"
                        sortKey="tier"
                        activeSortKey={sort.field}
                        sortDir={sort.direction}
                        onSortChange={toggleSort}
                        className="hidden text-start @md:table-cell"
                      />
                    )}
                    {columns.includes("winRate") && (
                      <SortableHeader
                        label="Win Rate"
                        sortKey="winRate"
                        activeSortKey={sort.field}
                        sortDir={sort.direction}
                        onSortChange={toggleSort}
                        className="text-start"
                      />
                    )}
                    {columns.includes("matches") && (
                      <SortableHeader
                        // Relative to the most bought item, like the hero tables' normalized pick rate; the item page's
                        // "Bought" is the share of players instead, so a bare "Pick Rate" read as a contradiction.
                        label="Pick Rate (Normalized)"
                        sortKey="matches"
                        activeSortKey={sort.field}
                        sortDir={sort.direction}
                        onSortChange={toggleSort}
                        className="text-start"
                      />
                    )}
                    {columns.includes("confidence") && (
                      <TableHead className="hidden text-center @md:table-cell">Confidence</TableHead>
                    )}
                    <TableHead className="text-center">
                      <span className="icon-[mdi--filter-variant] inline-block size-4 align-middle text-muted-foreground" />
                      <span className="sr-only">Filter</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
              )}
              <TableBody aria-busy={rowsCatchingUp || undefined}>
                {visibleData.map((row, index) => (
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
                    trendParams={trendParams}
                    trendBucket={trendBucket}
                    onTrendBucketChange={setTrendBucket}
                    isIncluded={includeItems.has(row.item_id)}
                    isExcluded={excludeItems.has(row.item_id)}
                    prevStatsMap={prevStatsMap}
                    onItemInclude={toggleInclude}
                    onItemExclude={toggleExclude}
                    customDropdownContent={customDropdownContent}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
          {/* A search or filter that leaves nothing would otherwise read as a table that failed to fill. */}
          {visibleData.length === 0 && (
            <EmptyState
              variant="inline"
              title={nameTerm ? `No items match "${nameQuery.trim()}"` : "No items match these filters"}
              action={
                nameTerm ? (
                  <Button variant="outline" size="sm" onClick={() => setNameQuery("")}>
                    Clear search
                  </Button>
                ) : undefined
              }
            />
          )}
        </StaleOverlay>
      )}
    </Stack>
  );
}
