/** One row of the item stats endpoint for a single player: how many of their matches had the item, and how they went. */
export interface PlayerItemStatRow {
  item_id: number;
  wins: number;
  matches: number;
  avg_buy_time_s: number;
  /** Zero when the item was never sold. */
  avg_sell_time_s: number;
}

/** What the ranking needs to know about an item from the asset list. */
export interface ItemMeta {
  id: number;
  item_tier: number;
  shopable: boolean;
  disabled?: boolean | null;
}

export interface FavoriteItem {
  itemId: number;
  /** Matches the player bought the item in. */
  matches: number;
  wins: number;
  /** Share of the player's matches with the item, capped at 1 (the two counts come from different tables). */
  share: number;
  winRate: number;
  avgBuyTimeS: number;
  /** Null when the item was never sold. */
  avgSellTimeS: number | null;
}

export const FAVORITE_ITEM_COUNT = 8;
/** Tier 1 items are bought early by nearly everyone and sold later; they would fill every list with the same eight. */
export const FAVORITE_MIN_TIER = 2;
/** An item bought once or twice is not a favorite. */
export const FAVORITE_MIN_MATCHES = 3;

/**
 * A player's most bought shop items of tier 2 and up, most bought first (the item id breaks ties so the order is
 * stable). Rows for items the asset list does not know, cannot sell or has disabled are dropped. Empty when the
 * player has no matches.
 */
export function favoriteItems(
  rows: readonly PlayerItemStatRow[],
  items: readonly ItemMeta[],
  playerMatches: number,
  limit = FAVORITE_ITEM_COUNT,
): FavoriteItem[] {
  if (!(playerMatches > 0)) return [];
  const itemsById = new Map(items.map((item) => [item.id, item]));
  return rows
    .filter((row) => {
      const item = itemsById.get(row.item_id);
      return (
        item !== undefined &&
        item.shopable &&
        !item.disabled &&
        item.item_tier >= FAVORITE_MIN_TIER &&
        row.matches >= FAVORITE_MIN_MATCHES
      );
    })
    .sort((a, b) => b.matches - a.matches || a.item_id - b.item_id)
    .slice(0, limit)
    .map((row) => ({
      itemId: row.item_id,
      matches: row.matches,
      wins: row.wins,
      share: Math.min(1, row.matches / playerMatches),
      winRate: row.wins / row.matches,
      avgBuyTimeS: row.avg_buy_time_s,
      avgSellTimeS: row.avg_sell_time_s > 0 ? row.avg_sell_time_s : null,
    }));
}
