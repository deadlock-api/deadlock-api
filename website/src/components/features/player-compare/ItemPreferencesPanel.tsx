import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ItemStats } from "deadlock_api_client";
import { useState } from "react";

import { ItemImage } from "~/components/domain/assets/ItemImage";
import { Panel, PanelBody, PanelHeader, PanelShowMore } from "~/components/patterns/panel/Panel";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { Grid } from "~/components/ui/grid";
import { Skeleton } from "~/components/ui/skeleton";
import { Inline, Stack } from "~/components/ui/stack";
import { StatusDot } from "~/components/ui/status-dot";
import { Text } from "~/components/ui/text";
import { Tooltip, TooltipHeader, TooltipStat, TooltipStats, TooltipTarget } from "~/components/ui/tooltip";
import { FAVORITE_ITEM_COUNT, type FavoriteItem, favoriteItems } from "~/lib/compare-items";
import { formatPercent, formatShare, possessive } from "~/lib/format";
import { formatStatValue } from "~/lib/stat-format";
import { toneOf } from "~/lib/tone";
import { type SlimUpgrade, itemUpgradesQueryOptions } from "~/queries/asset-queries";
import { itemStatsQueryOptions } from "~/queries/item-stats-query";
import { type CompareFilters, compareItemStatsParams, lastAnswerForAccount } from "~/queries/player-compare-queries";

import type { ComparedPlayer } from "./types";

/** A narrow panel (a phone, the columns stacked) shows each player's top five until expanded. */
const NARROW_ITEM_COUNT = 5;
/** Expanded, each player's top items up to this many: past it the list is a long tail of one-off buys. */
const EXPANDED_ITEM_COUNT = 16;

/** Columns by the panel's width: one per player once each has room for an item name. */

const COLUMNS = {
  2: { base: 1, sm: 2 },
  3: { base: 1, sm: 3 },
  4: { base: 1, sm: 2, lg: 4 },
  5: { base: 1, sm: 3, xl: 5 },
} as const;

type Column =
  | { state: "loading" }
  | { state: "error"; retry: () => void; retrying: boolean }
  | { state: "ready"; items: FavoriteItem[] };

/** Each player's most bought items of tier 2 and up on the page's filters, with how often and how well. */
export function ItemPreferencesPanel({ players, filters }: { players: ComparedPlayer[]; filters: CompareFilters }) {
  const [expanded, setExpanded] = useState(false);
  const itemsQuery = useQuery(itemUpgradesQueryOptions);
  const client = useQueryClient();
  const statsQueries = useQueries({
    queries: players.map((player) => ({
      ...itemStatsQueryOptions(compareItemStatsParams(player.accountId, filters)),
      placeholderData: lastAnswerForAccount<ItemStats[]>(client, "api-item-stats", player.accountId),
    })),
  });
  const itemsById = new Map((itemsQuery.data ?? []).map((item) => [item.id, item]));

  const columns: Column[] = players.map((player, index) => {
    const query = statsQueries[index];
    if ((query?.isError && !query.data) || (itemsQuery.isError && !itemsQuery.data)) {
      const failed = [query, itemsQuery].filter((q) => q?.isError);
      return {
        state: "error",
        retry: () => failed.forEach((q) => void q?.refetch()),
        retrying: failed.some((q) => q?.isFetching),
      };
    }
    if (player.aggregate === null) return { state: "ready", items: [] };
    if (!query?.data || !itemsQuery.data || player.aggregate === undefined) return { state: "loading" };
    // The items the expanded panel can show; collapsed, it shows the first few.
    return {
      state: "ready",
      items: favoriteItems(query.data, itemsQuery.data, player.aggregate.matches, EXPANDED_ITEM_COUNT),
    };
  });

  if (columns.every((column) => column.state === "ready" && column.items.length === 0)) return null;

  const count = Math.min(Math.max(players.length, 2), 5) as keyof typeof COLUMNS;
  const longest = Math.max(0, ...columns.map((column) => (column.state === "ready" ? column.items.length : 0)));
  return (
    // The panel's own width decides how many items a collapsed list shows, not each player's column.
    <Panel className="@container/items">
      <PanelHeader size="sm" title="Favorite items" />
      <PanelBody size="sm">
        <Grid columns={players.length === 1 ? 1 : COLUMNS[count]} gap={4}>
          {players.map((player, index) => (
            <PlayerItems
              key={player.accountId}
              player={player}
              column={columns[index]}
              itemsById={itemsById}
              expanded={expanded}
              alone={players.length === 1}
            />
          ))}
        </Grid>
      </PanelBody>
      {/* Wide, the collapsed panel shows eight a player; narrow, five, so six to eight items only need the control on a
          narrow panel. */}
      {longest > NARROW_ITEM_COUNT && (
        <PanelShowMore
          open={expanded}
          onOpenChange={setExpanded}
          total={longest}
          className={longest <= FAVORITE_ITEM_COUNT ? "@md/items:hidden" : undefined}
        />
      )}
    </Panel>
  );
}

function PlayerItems({
  player,
  column,
  itemsById,
  expanded,
  alone,
}: {
  player: ComparedPlayer;
  column: Column;
  itemsById: ReadonlyMap<number, SlimUpgrade>;
  /** Every item, rather than the first few. */
  expanded: boolean;
  /** The only player: the list flows over the panel's width in columns rather than down one of them. */
  alone: boolean;
}) {
  return (
    <Stack gap={1.5}>
      <Inline gap={1.5} wrap="nowrap">
        <StatusDot color={player.color} />
        <Text variant="label" wrap="truncate" title={player.name}>
          {player.name}
        </Text>
      </Inline>
      {column.state === "error" ? (
        <ErrorState variant="inline" title="Could not load items" onRetry={column.retry} retrying={column.retrying} />
      ) : column.state === "ready" && column.items.length === 0 ? (
        <Text variant="caption" tone="muted">
          No items on these filters
        </Text>
      ) : (
        <Grid columns={alone ? { base: 1, sm: 2, lg: 4 } : 1} gap={1} asChild>
          <ul aria-label={`${possessive(player.name)} favorite items`}>
            {column.state === "loading"
              ? Array.from({ length: FAVORITE_ITEM_COUNT }, (_, index) => <ItemRowSkeleton key={index} />)
              : (expanded ? column.items : column.items.slice(0, FAVORITE_ITEM_COUNT)).map((entry, index) => (
                  <ItemRow
                    key={entry.itemId}
                    entry={entry}
                    item={itemsById.get(entry.itemId)}
                    // A narrow panel (a phone, the columns stacked) keeps each player's top five.
                    className={!expanded && index >= NARROW_ITEM_COUNT ? "hidden @md/items:list-item" : undefined}
                  />
                ))}
          </ul>
        </Grid>
      )}
    </Stack>
  );
}

function ItemRow({
  entry,
  item,
  className,
}: {
  entry: FavoriteItem;
  item: SlimUpgrade | undefined;
  className?: string;
}) {
  const name = item?.name ?? "Unknown item";
  // Judged as printed: a 50.4% win rate reads "50%" and is not colored as a win.
  const tone = toneOf(Math.round(entry.winRate * 100), 50);
  return (
    <li className={className}>
      <Tooltip
        content={
          <>
            <TooltipHeader
              leading={<ItemImage item={item} title="" />}
              title={name}
              subtitle={item ? `Tier ${item.item_tier} · ${formatStatValue(item.cost, "integer")} souls` : undefined}
            />
            <TooltipStats>
              <TooltipStat
                label="Bought in"
                value={`${formatStatValue(entry.matches, "integer")} matches (${formatShare(entry.share)})`}
              />
              <TooltipStat label="Record" value={`${entry.wins}W ${entry.matches - entry.wins}L`} />
              <TooltipStat label="Win rate" value={formatPercent(entry.winRate)} />
              <TooltipStat label="Avg. bought at" value={formatStatValue(entry.avgBuyTimeS, "duration")} />
              {entry.avgSellTimeS != null && (
                <TooltipStat label="Avg. sold at" value={formatStatValue(entry.avgSellTimeS, "duration")} />
              )}
            </TooltipStats>
          </>
        }
      >
        <TooltipTarget display="block">
          <Inline gap={2} wrap="nowrap">
            <ItemImage item={item} title="" className="shrink-0" />
            <Stack gap={0} className="flex-1">
              <Text wrap="truncate">{name}</Text>
              <Text variant="caption" tone="muted" numeric="tabular" wrap="truncate">
                {/* Short, so the win rate survives a narrow column; the tooltip spells it out. */}
                {formatShare(entry.share)}
                <span className="sr-only"> bought</span> ·{" "}
                <Text variant="caption" tone={tone === "muted" ? "muted" : tone}>
                  {formatPercent(entry.winRate, 0)} WR
                </Text>
              </Text>
            </Stack>
          </Inline>
        </TooltipTarget>
      </Tooltip>
    </li>
  );
}

/** The loaded row's shape: the icon and two lines of text, so the panel keeps its height when the data lands. */
function ItemRowSkeleton() {
  return (
    <li aria-hidden="true">
      <Inline gap={2} wrap="nowrap">
        <Skeleton className="size-8 shrink-0" />
        <Stack gap={0} className="flex-1">
          <Text as="div" align="start">
            <Skeleton className="inline-block h-3 w-3/4 align-middle" />
          </Text>
          <Text as="div" variant="caption">
            <Skeleton className="inline-block h-2.5 w-1/2 align-middle" />
          </Text>
        </Stack>
      </Inline>
    </li>
  );
}
