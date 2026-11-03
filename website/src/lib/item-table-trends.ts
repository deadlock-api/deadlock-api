import type { ItemStats } from "deadlock_api_client";

import type { StatFormat } from "~/lib/stat-format";

export const ITEM_TABLE_TRENDS = {
  winRate: { label: "Win Rate", format: "percent" },
  vsTier: { label: "Win Rate vs Tier", format: "points" },
  pickRate: { label: "Pick Rate", format: "percent" },
  pickVsTier: { label: "Pick Rate vs Tier", format: "multiple" },
  buyTime: { label: "Bought At", format: "duration" },
  kept: { label: "Kept", format: "percent" },
} as const satisfies Record<string, { label: string; format: StatFormat }>;

export type ItemTableTrend = keyof typeof ITEM_TABLE_TRENDS;

/** One tier's purchases pooled over the items of a table: its wins, its purchases and how many items it has. */
export interface ItemTierTotals {
  wins: number;
  matches: number;
  items: number;
}

/** Each tier's pooled counts over `rows` (one row per item), keyed by tier. */
export function itemTierTotals<Row extends Pick<ItemStats, "wins" | "matches">>(
  rows: readonly Row[],
  tierOf: (row: Row) => number,
): Map<number, ItemTierTotals> {
  const totals = new Map<number, ItemTierTotals>();
  for (const row of rows) {
    const tier = tierOf(row);
    const total = totals.get(tier) ?? { wins: 0, matches: 0, items: 0 };
    total.wins += row.wins;
    total.matches += row.matches;
    total.items += 1;
    totals.set(tier, total);
  }
  return totals;
}

/** An item measured against its tier, from its own counts and its tier's `itemTierTotals`. */
export interface ItemVsTier {
  /** The tier's pooled win rate: tier 4 items win more because their buyers are ahead. */
  tierWinRate: number;
  /** `winRate - tierWinRate`. */
  vsTier: number;
  /**
   * How often the item is bought against the average item of its tier: 2 is twice as often. A multiple, not a
   * percentage: a tier's few staples are bought several times as often as its long tail drags the average down to.
   */
  pickVsTier: number;
}

export function itemVsTier(row: Pick<ItemStats, "wins" | "matches">, tier: ItemTierTotals | undefined): ItemVsTier {
  const winRate = row.wins / row.matches;
  if (!tier || tier.matches === 0) return { tierWinRate: winRate, vsTier: 0, pickVsTier: 1 };
  const tierWinRate = tier.wins / tier.matches;
  return { tierWinRate, vsTier: winRate - tierWinRate, pickVsTier: (row.matches * tier.items) / tier.matches };
}

/** The share of purchases still owned when the match ended: not sold, and not used up by an upgrade. */
export function itemKeptRate(row: Pick<ItemStats, "matches" | "sold">): number {
  return 1 - Math.min(row.sold ?? 0, row.matches) / row.matches;
}
