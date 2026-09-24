import type { ItemSlotType } from "deadlock_api_client";

import type { Pickable } from "~/components/patterns/picker/picker";

/**
 * The item shop's rules on top of the picker grid: which slot tab shows which items, in what order, and how a slot's
 * items fall into tiers.
 */

/** The shop's slots, in the shop's order. */
export const SHOP_SLOTS = ["weapon", "vitality", "spirit"] as const satisfies readonly ItemSlotType[];

/** A tab of the item picker: one slot, or every slot at once (where a search looks). */
export type ItemSlotTab = "all" | ItemSlotType;

export const SLOT_TAB_LABEL: Record<ItemSlotTab, string> = {
  all: "All",
  weapon: "Weapon",
  vitality: "Vitality",
  spirit: "Spirit",
};

/** What the item picker needs of an item; the asset API's `Upgrade` fits. */
export interface PickableItem extends Pickable {
  item_tier: number;
  item_slot_type: ItemSlotType;
  cost?: number | null;
}

/** Tier, then slot in shop order, then name: the order of the shop and of `groupByTier`. */
export function compareShopItems(a: PickableItem, b: PickableItem): number {
  if (a.item_tier !== b.item_tier) return a.item_tier - b.item_tier;
  const slot = SHOP_SLOTS.indexOf(a.item_slot_type) - SHOP_SLOTS.indexOf(b.item_slot_type);
  return slot || a.name.localeCompare(b.name);
}

/** The items of one tab: every item on `all`, else those of the slot. Order is kept. */
export function itemsInTab<T extends PickableItem>(items: readonly T[], tab: ItemSlotTab): readonly T[] {
  return tab === "all" ? items : items.filter((item) => item.item_slot_type === tab);
}

export interface TierGroup<T extends PickableItem> {
  tier: number;
  /** What most items of the tier cost, from the items themselves; `undefined` when none has a cost. */
  cost: number | undefined;
  items: T[];
}

/** The items by tier, lowest first, each tier in the order the items came in; tiers without an item are left out. */
export function groupByTier<T extends PickableItem>(items: readonly T[]): TierGroup<T>[] {
  const byTier = new Map<number, T[]>();
  for (const item of items) {
    const list = byTier.get(item.item_tier);
    if (list) list.push(item);
    else byTier.set(item.item_tier, [item]);
  }
  return [...byTier.entries()]
    .sort(([a], [b]) => a - b)
    .map(([tier, list]) => ({ tier, cost: commonCost(list), items: list }));
}

/** The cost most items share (a tier's price), the lower one on a tie. */
function commonCost(items: readonly PickableItem[]): number | undefined {
  const counts = new Map<number, number>();
  for (const { cost } of items) if (cost != null && cost > 0) counts.set(cost, (counts.get(cost) ?? 0) + 1);
  let best: number | undefined;
  for (const [cost, count] of counts) {
    const bestCount = best === undefined ? 0 : (counts.get(best) ?? 0);
    if (count > bestCount || (count === bestCount && best !== undefined && cost < best)) best = cost;
  }
  return best;
}

/** How many chosen items each tab holds, for the count on the tab. */
export function chosenPerTab(items: readonly PickableItem[], chosen: ReadonlySet<number>): Record<ItemSlotTab, number> {
  const counts: Record<ItemSlotTab, number> = { all: 0, weapon: 0, vitality: 0, spirit: 0 };
  for (const item of items) {
    if (!chosen.has(item.id)) continue;
    counts.all++;
    counts[item.item_slot_type]++;
  }
  return counts;
}

/**
 * The tab a search moves to: typing into an empty search leaves the slot for `all`, so a search finds an item in any
 * slot; clearing it returns to the slot it left. `from` is the slot the search left, if it did.
 */
export function tabForSearch(
  tab: ItemSlotTab,
  from: ItemSlotTab | null,
  before: string,
  after: string,
): { tab: ItemSlotTab; from: ItemSlotTab | null } {
  const was = before.trim() !== "";
  const is = after.trim() !== "";
  if (!was && is && tab !== "all") return { tab: "all", from: tab };
  if (was && !is && from !== null && tab === "all") return { tab: from, from: null };
  return { tab, from: is ? from : null };
}
