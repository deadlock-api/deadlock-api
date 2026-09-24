import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import {
  chosenPerTab,
  compareShopItems,
  groupByTier,
  type ItemSlotTab,
  itemsInTab,
  type PickableItem,
  SHOP_SLOTS,
  tabForSearch,
} from "~/components/domain/selectors/item-picker";
import { chosenIds } from "~/components/patterns/picker/picker";
import { type PickerSelectionProps, usePicker } from "~/components/patterns/picker/usePicker";
import { filterShopableItems, itemUpgradesQueryOptions } from "~/queries/asset-queries";

/** Every item on sale, in shop order (tier, slot, name): what every item picker offers by default. */
export function useShopItems() {
  const { data: items = [], isLoading } = useQuery({
    ...itemUpgradesQueryOptions,
    select: (all) => filterShopableItems(all).sort(compareShopItems),
  });
  return { items, isLoading };
}

/** The value of each selection mode, with the matching `value` / `defaultValue` / `onValueChange`. */
export type ItemSelectionProps = PickerSelectionProps;

export type ItemPickerOptions<T extends PickableItem> = ItemSelectionProps & {
  /** The items on offer. Within a tier they keep this order (by name, or by a stat). */
  items: readonly T[];
  /** Items that are shown but cannot be picked. */
  disabledItemIds?: ReadonlySet<number>;
  /** When Enter in the search box picks the first match (see `usePicker`). */
  enterPicks?: "searching" | "always";
  /** The slot tab it opens on. */
  defaultSlot?: ItemSlotTab;
};

export type ItemPicker<T extends PickableItem = PickableItem> = ReturnType<typeof useItemPicker<T>>;

/**
 * `usePicker` over the item shop: the slot tab (`slot`, `setSlot`), the search, the items of the tab that match it
 * grouped by tier (`groups`, render them in order with `ItemGridTier` and `ItemGridTile`), the value of the selection
 * mode and the keyboard cursor. Typing a search moves to the `all` tab, so it finds an item in any slot; clearing it
 * returns to the slot it left. `chosenPerSlot` counts the chosen items of each tab.
 */
export function useItemPicker<T extends PickableItem>({
  items,
  disabledItemIds,
  defaultSlot = "weapon",
  ...options
}: ItemPickerOptions<T>) {
  const [slot, setSlotState] = useState<ItemSlotTab>(defaultSlot);
  const [searchLeft, setSearchLeft] = useState<ItemSlotTab | null>(null);
  // Tier, then slot: the order the tiers are drawn in, so the keyboard and "Enter picks the first" follow the screen.
  const ordered = useMemo(
    () =>
      [...items].sort(
        (a, b) =>
          a.item_tier - b.item_tier || SHOP_SLOTS.indexOf(a.item_slot_type) - SHOP_SLOTS.indexOf(b.item_slot_type),
      ),
    [items],
  );
  const choices = useMemo(() => itemsInTab(ordered, slot), [ordered, slot]);
  const picker = usePicker<T>({ ...options, choices, disabledIds: disabledItemIds });
  const groups = useMemo(() => groupByTier(picker.matches), [picker.matches]);
  const chosenPerSlot = chosenPerTab(items, chosenIds(picker.value as Parameters<typeof chosenIds>[0]));

  const setSearch = (next: string) => {
    const moved = tabForSearch(slot, searchLeft, picker.search, next);
    setSlotState(moved.tab);
    setSearchLeft(moved.from);
    picker.setSearch(next);
  };
  /** A tab chosen by hand stays chosen when the search is cleared. */
  const setSlot = (next: ItemSlotTab) => {
    setSlotState(next);
    setSearchLeft(null);
  };

  return { ...picker, setSearch, items, slot, setSlot, groups, chosenPerSlot };
}
