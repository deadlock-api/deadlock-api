import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import { Combine, ShoppingBag } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";

import { ItemCell } from "~/components/domain/assets/ItemCell";
import { SortableHeader } from "~/components/patterns/data-table/SortableHeader";
import { PanelWithDetails } from "~/components/patterns/panel/PanelWithDetails";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { SkeletonRows } from "~/components/patterns/states/Skeletons";
import { Delta } from "~/components/ui/delta";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableRowHeader } from "~/components/ui/table";
import { formatPercent } from "~/lib/format";
import { MODE_CONFIG } from "~/lib/game-mode";
import { isShopableItem } from "~/lib/item-roster";
import { formatClock } from "~/lib/stat-format";
import type { TrackerFilterValues } from "~/lib/tracker/compute";
import {
  type ItemSortDir,
  type ItemSortKey,
  MIN_ITEM_GAMES,
  sortItemRows,
  toItemPairRows,
  toItemRows,
  type TrackerItemPairRow,
  type TrackerItemRow,
} from "~/lib/tracker/item-performance";
import { cn } from "~/lib/utils";
import { itemUpgradesQueryOptions, type SlimUpgrade } from "~/queries/asset-queries";
import {
  type TrackerMatchStatsParams,
  trackerItemPairStatsQueryOptions,
  trackerItemStatsQueryOptions,
} from "~/queries/tracker-queries";

/**
 * Hidden in a narrow table (a phone), where it cut the item names to a few letters; the difference beside it says the
 * same against the player's own win rate, and heads the sort.
 */
const NARROW_HIDDEN = "hidden @sm:table-cell";
/** Five rows, as the hero pool and the teammates beside it show. */
const PREVIEW_ROWS = 5;
/** The dialog lists every item, and the pairs that lead the chosen sort. */
const DIALOG_PAIRS = 100;

interface Sort {
  key: ItemSortKey;
  dir: ItemSortDir;
}

/**
 * The player's items and item pairs in the selected matches: how often they bought each and how they did when they
 * did, against their own win rate in the same matches (`baseline`).
 */
export function ItemPanels({
  accountId,
  filters,
  baseline,
}: {
  accountId: number;
  filters: TrackerFilterValues;
  baseline: number;
}) {
  const mode = MODE_CONFIG[filters.mode];
  const params: TrackerMatchStatsParams = {
    accountId,
    gameMode: mode.gameMode,
    matchMode: mode.matchMode,
    heroId: filters.heroId,
    minUnixTimestamp: filters.minUnixTimestamp,
    maxUnixTimestamp: filters.maxUnixTimestamp,
  };
  const itemsQuery = useQuery(trackerItemStatsQueryOptions(params));
  const pairsQuery = useQuery(trackerItemPairStatsQueryOptions(params));
  const { data: assets } = useQuery(itemUpgradesQueryOptions);
  const itemsById = useMemo(
    () => new Map((assets ?? []).filter(isShopableItem).map((item) => [item.id, item])),
    [assets],
  );

  const itemRows = useMemo(
    () => (itemsQuery.data && assets ? toItemRows(itemsQuery.data, baseline, (id) => itemsById.has(id)) : undefined),
    [itemsQuery.data, assets, baseline, itemsById],
  );
  const pairRows = useMemo(
    () =>
      pairsQuery.data && assets ? toItemPairRows(pairsQuery.data, baseline, (id) => itemsById.has(id)) : undefined,
    [pairsQuery.data, assets, baseline, itemsById],
  );

  return (
    <div className="grid gap-2 @2xl/overview:grid-cols-2">
      <PerformancePanel
        title="Items"
        icon={ShoppingBag}
        rowLabel="Item"
        noun={["item", "items"]}
        query={itemsQuery}
        rows={itemRows}
        id={(row) => String(row.itemId)}
        identity={(row) => <ItemCell size="sm" item={itemsById.get(row.itemId)} />}
        extraColumns={[
          { label: "Bought", format: (row) => formatClock(row.avgBuyTimeS) },
          { label: "Sold", format: (row) => formatPercent(row.soldRate, 0) },
        ]}
      />
      <PerformancePanel
        title="Item pairs"
        icon={Combine}
        rowLabel="Pair"
        noun={["pair", "pairs"]}
        dialogLimit={DIALOG_PAIRS}
        query={pairsQuery}
        rows={pairRows}
        id={(row) => row.itemIds.join("-")}
        identity={(row) => <ItemPair items={row.itemIds.map((id) => itemsById.get(id))} />}
      />
    </div>
  );
}

/** Two items side by side, or one above the other where a narrow table would cut both names to a letter. */
function ItemPair({ items }: { items: (SlimUpgrade | undefined)[] }) {
  return (
    <span className="flex min-w-0 flex-col gap-0.5 @md:flex-row @md:items-center @md:gap-1.5">
      {items.map((item, i) => (
        <span key={item?.id ?? i} className="flex min-w-0 flex-1 items-center gap-1.5">
          {i > 0 && (
            <>
              <span aria-hidden="true" className="hidden text-muted-foreground @md:inline">
                +
              </span>
              <span className="sr-only">and</span>
            </>
          )}
          <ItemCell size="sm" item={item} className="flex-1" />
        </span>
      ))}
    </span>
  );
}

interface ExtraColumn<Row> {
  label: string;
  format: (row: Row) => ReactNode;
}

function PerformancePanel<Row extends TrackerItemRow | TrackerItemPairRow>({
  title,
  icon,
  rowLabel,
  noun,
  query,
  rows,
  id,
  identity,
  extraColumns,
  dialogLimit,
}: {
  title: string;
  icon: React.ComponentProps<typeof PanelWithDetails>["icon"];
  /** Heads the column that names each row. */
  rowLabel: string;
  noun: [singular: string, plural: string];
  query: UseQueryResult;
  rows: Row[] | undefined;
  id: (row: Row) => string;
  identity: (row: Row) => ReactNode;
  /** Columns only the dialog shows. */
  extraColumns?: ExtraColumn<Row>[];
  dialogLimit?: number;
}) {
  const [sort, setSort] = useState<Sort>({ key: "winrate", dir: "desc" });
  const sorted = useMemo(() => (rows ? sortItemRows(rows, sort.key, sort.dir, id) : []), [rows, sort, id]);
  const onSortChange = (key: ItemSortKey) =>
    setSort((current) => ({ key, dir: current.key === key && current.dir === "desc" ? "asc" : "desc" }));
  const count = (n: number) => `${n.toLocaleString("en-US")} ${n === 1 ? noun[0] : noun[1]}`;
  const extras = extraColumns ?? [];
  const dialogRows = dialogLimit == null ? sorted : sorted.slice(0, dialogLimit);

  const table = (shown: Row[], extras: ExtraColumn<Row>[]) => (
    <div className="@container">
      <Table density="dense" aria-label={`${title} in selected matches`}>
        <TableHeader>
          <TableRow>
            <TableHead className="ps-0 text-xs text-muted-foreground">{rowLabel}</TableHead>
            <SortableHeader
              label="Games"
              sortKey="matches"
              activeSortKey={sort.key}
              sortDir={sort.dir}
              onSortChange={onSortChange}
              align="end"
              size="sm"
              className="text-xs text-muted-foreground"
            />
            <TableHead className={cn("text-end text-xs text-muted-foreground", NARROW_HIDDEN)}>Win %</TableHead>
            <SortableHeader
              label="vs avg"
              sortKey="winrate"
              activeSortKey={sort.key}
              sortDir={sort.dir}
              onSortChange={onSortChange}
              align="end"
              size="sm"
              className={cn("text-xs text-muted-foreground", extras.length === 0 && "pe-0")}
            />
            {extras.map((column) => (
              <TableHead key={column.label} className="hidden text-end text-xs text-muted-foreground @md:table-cell">
                {column.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.map((row) => (
            <TableRow key={id(row)}>
              {/* The names take the width the numbers leave and shorten with an ellipsis. */}
              <TableRowHeader className="w-full max-w-0 ps-0 text-xs font-medium">{identity(row)}</TableRowHeader>
              <TableCell className="text-end text-xs tabular-nums">{row.matches.toLocaleString("en-US")}</TableCell>
              <TableCell className={cn("text-end text-xs tabular-nums", NARROW_HIDDEN)}>
                {formatPercent(row.winrate, 0)}
              </TableCell>
              <TableCell className={cn("text-end text-xs tabular-nums", extras.length === 0 && "pe-0")}>
                <Delta value={row.delta} digits={0} unit=" pp" zero="visible" significant={row.significant} />
              </TableCell>
              {extras.map((column) => (
                <TableCell key={column.label} className="hidden text-end text-xs tabular-nums @md:table-cell">
                  {column.format(row)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );

  const body = (shown: Row[], extras: ExtraColumn<Row>[]) =>
    rows === undefined ? (
      query.isError ? (
        <ErrorState
          variant="inline"
          title={`Could not load ${title.toLowerCase()}`}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : (
        <SkeletonRows rows={PREVIEW_ROWS} size="sm" variant="solid" label={title.toLowerCase()} className="py-2" />
      )
    ) : sorted.length === 0 ? (
      <EmptyState
        variant="inline"
        size="compact"
        title={`No ${noun[1]} bought in ${MIN_ITEM_GAMES}+ selected matches.`}
      />
    ) : (
      table(shown, extras)
    );

  return (
    <PanelWithDetails
      title={title}
      icon={icon}
      footer={rows && <output>{`${Math.min(PREVIEW_ROWS, sorted.length)} of ${count(sorted.length)}`}</output>}
      details={
        <div className="flex flex-col gap-2">
          {rows && dialogRows.length < sorted.length && (
            <output className="text-xs text-muted-foreground">{`${dialogRows.length} of ${count(sorted.length)}`}</output>
          )}
          {body(dialogRows, extras)}
        </div>
      }
    >
      {body(sorted.slice(0, PREVIEW_ROWS), [])}
    </PanelWithDetails>
  );
}
