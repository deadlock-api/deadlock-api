import { queryOptions } from "@tanstack/react-query";
import type { AnalyticsApiItemPermutationStatsRequest, ItemPermutationStats, Upgrade } from "deadlock_api_client";

import { CACHE_DURATIONS } from "~/constants/cache";
import { api } from "~/lib/api";
import { shrunkWinRate } from "~/lib/shrinkage";

import { queryKeys } from "./query-keys";

export function itemPermutationStatsQueryOptions(params: AnalyticsApiItemPermutationStatsRequest) {
  return queryOptions({
    queryKey: queryKeys.analytics.itemPermutationStats(params),
    queryFn: async () => {
      const response = await api.analytics_api.itemPermutationStats(params);
      return response.data;
    },
    staleTime: CACHE_DURATIONS.ONE_DAY,
  });
}

/** Items still sold in the shop; a combination is listed only when all of its items are. */
export function shopableItemIds(
  items: readonly Pick<Upgrade, "id" | "disabled" | "shopable" | "shop_image_webp">[] | undefined,
): Set<number> {
  return new Set((items ?? []).filter((i) => !i.disabled && i.shopable && i.shop_image_webp).map((i) => i.id));
}

/** Combinations the table lists: every item in them can still be bought. */
export function listableItemCombos(
  rows: readonly ItemPermutationStats[],
  shopableItemIds: ReadonlySet<number>,
): ItemPermutationStats[] {
  return rows.filter((row) => row.item_ids.every((id) => shopableItemIds.has(id)));
}

/**
 * Listed combinations by win rate shrunk toward 50%: a raw win-rate sort would put every 100% combination with a dozen
 * matches above the ones proven over thousands. A row without items (the remainder of a trimmed answer) only counts
 * toward the totals.
 */
export function rankItemCombos(rows: readonly ItemPermutationStats[]): ItemPermutationStats[] {
  return rows
    .filter((row) => row.item_ids.length > 0)
    .map((row) => ({ row, score: shrunkWinRate(row.wins, row.matches) }))
    .sort((a, b) => b.score - a.score)
    .map(({ row }) => row);
}

const comboKey = (itemIds: readonly number[]) => [...itemIds].sort((a, b) => a - b).join("-");

/**
 * The part of a combination answer the table's default view reads: the listable rows it shows (`count`, or those of
 * `shown` for the previous interval) in their original order, plus one row without items carrying the matches of all
 * other listable rows, so each row's share of combo matches stays exact. Megabytes shrink to a few kilobytes.
 */
export function trimItemCombosForView(
  rows: readonly ItemPermutationStats[],
  shopableItemIds: ReadonlySet<number>,
  shown: { count: number } | { combos: readonly ItemPermutationStats[] },
): ItemPermutationStats[] {
  const listable = listableItemCombos(rows, shopableItemIds);
  const keys = new Set(
    ("count" in shown ? rankItemCombos(listable).slice(0, shown.count) : shown.combos).map((row) =>
      comboKey(row.item_ids),
    ),
  );
  const kept = listable.filter((row) => keys.has(comboKey(row.item_ids)));
  const rest = listable.filter((row) => !keys.has(comboKey(row.item_ids)));
  if (rest.length === 0) return kept;
  const remainder: ItemPermutationStats = { item_ids: [], wins: 0, losses: 0, matches: 0 };
  for (const row of rest) {
    remainder.wins += row.wins;
    remainder.losses += row.losses;
    remainder.matches += row.matches;
  }
  return [...kept, remainder];
}
