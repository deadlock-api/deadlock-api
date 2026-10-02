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
