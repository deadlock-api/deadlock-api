import { useQueries, useQuery } from "@tanstack/react-query";

import { ItemImage } from "~/components/domain/assets/ItemImage";
import { Panel, PanelBody, PanelHeader } from "~/components/patterns/panel/Panel";
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
import { type CompareFilters, compareItemStatsParams } from "~/queries/player-compare-queries";

import type { ComparedPlayer } from "./types";

/** Columns by the panel's width: one per player once each has room for an item name. */
const COLUMNS = {
  2: { base: 1, sm: 2 },
  3: { base: 1, lg: 3 },
  4: { base: 1, sm: 2, xl: 4 },
  5: { base: 1, sm: 2, lg: 3, xl: 5 },
} as const;

type Column =
  | { state: "loading" }
  | { state: "error"; retry: () => void; retrying: boolean }
  | { state: "ready"; items: FavoriteItem[] };

/** Each player's most bought items of tier 2 and up on the page's filters, with how often and how well. */
export function ItemPreferencesPanel({ players, filters }: { players: ComparedPlayer[]; filters: CompareFilters }) {
  const itemsQuery = useQuery(itemUpgradesQueryOptions);
  const statsQueries = useQueries({
    queries: players.map((player) => itemStatsQueryOptions(compareItemStatsParams(player.accountId, filters))),
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
    return { state: "ready", items: favoriteItems(query.data, itemsQuery.data, player.aggregate.matches) };
  });

  if (columns.every((column) => column.state === "ready" && column.items.length === 0)) return null;

  const count = Math.min(Math.max(players.length, 2), 5) as keyof typeof COLUMNS;
  return (
    <Panel>
      <PanelHeader size="sm" title="Favorite items" />
      <PanelBody size="sm">
        <Grid columns={COLUMNS[count]} gap={4}>
          {players.map((player, index) => (
            <PlayerItems key={player.accountId} player={player} column={columns[index]} itemsById={itemsById} />
          ))}
        </Grid>
      </PanelBody>
    </Panel>
  );
}

function PlayerItems({
  player,
  column,
  itemsById,
}: {
  player: ComparedPlayer;
  column: Column;
  itemsById: ReadonlyMap<number, SlimUpgrade>;
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
        <Stack gap={1} asChild>
          <ul aria-label={`${possessive(player.name)} favorite items`}>
            {column.state === "loading"
              ? Array.from({ length: FAVORITE_ITEM_COUNT }, (_, index) => <ItemRowSkeleton key={index} />)
              : column.items.map((entry) => (
                  <ItemRow key={entry.itemId} entry={entry} item={itemsById.get(entry.itemId)} />
                ))}
          </ul>
        </Stack>
      )}
    </Stack>
  );
}

function ItemRow({ entry, item }: { entry: FavoriteItem; item: SlimUpgrade | undefined }) {
  const name = item?.name ?? "Unknown item";
  // Judged as printed: a 50.4% win rate reads "50%" and is not colored as a win.
  const tone = toneOf(Math.round(entry.winRate * 100), 50);
  return (
    <li>
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
                {formatShare(entry.share)} bought ·{" "}
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
