import {
  parseAsArrayOf,
  parseAsBoolean,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
  throttle,
  useQueryState,
} from "nuqs";
import { startTransition, useMemo } from "react";

import { ItemSelector } from "~/components/domain/selectors/ItemSelector";
import { ITEM_SLOTS } from "~/components/domain/selectors/ItemSlotSelector";
import { useCorruptedItemMode } from "~/components/features/items/useCorruptedItemMode";
import { FilterToggleCell } from "~/components/patterns/filter-bar/FilterCell";
import type { TriState } from "~/components/patterns/filter-bar/TriStateSelector";
import { SegmentedItem } from "~/components/ui/segmented";
import { parseAsSetOf } from "~/lib/nuqs-parsers";

// The item stats view's own filters and their URL state, kept out of the lazily loaded table so the page's filter row
// can draw them before the table's chunk arrives.

/** Two lists changed by one tap land in one history entry, in a transition so the tap paints first. */
const together = { limitUrlUpdates: throttle(50) };

export function useItemTiers() {
  return useQueryState("item_tiers", parseAsArrayOf(parseAsInteger).withDefault([]));
}

export function useItemSlots() {
  return useQueryState("item_slots", parseAsArrayOf(parseAsStringLiteral(ITEM_SLOTS)).withDefault([...ITEM_SLOTS]));
}

/** The Pick Rate column's filter: rows below this normalized pick rate, in percent, are left out. */
export function useItemMinPickRate() {
  return useQueryState("min_pick_rate", parseAsInteger.withDefault(0));
}

/** The table's name search, in the URL like its other filters; replace, so each keystroke is not a history entry. */
export function useItemNameQuery() {
  return useQueryState("item_q", parseAsString.withDefault("").withOptions({ history: "replace" }));
}

/** The items to include and leave out: two URL lists, edited by the item filter and by the rows' toggles alike. */
export function useItemLists() {
  const [includeItems, setIncludeItems] = useQueryState(
    "include_items",
    parseAsSetOf(parseAsInteger).withDefault(new Set()),
  );
  const [excludeItems, setExcludeItems] = useQueryState(
    "exclude_items",
    parseAsSetOf(parseAsInteger).withDefault(new Set()),
  );
  return { includeItems, setIncludeItems, excludeItems, setExcludeItems };
}

/**
 * The item table's filters that change its query, for the page's filter row: items to include or leave out and which
 * purchases count. The name, slot, tier and pick rate filters only narrow the rows shown and sit in their columns' heads.
 */
export function ItemStatsControls() {
  const { includeItems, setIncludeItems, excludeItems, setExcludeItems } = useItemLists();
  const [corruptedMode, setCorruptedMode] = useCorruptedItemMode();
  // The item filter holds both lists as one include / exclude map.
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
    startTransition(() => {
      void setIncludeItems(ids("included"), together);
      void setExcludeItems(ids("excluded"), together);
    });
  };
  return (
    <>
      <ItemSelector
        data-item-filter=""
        selection="tri-state"
        size="sm"
        value={itemStates}
        onValueChange={setItemStates}
      />
      <FilterToggleCell
        label="Purchases"
        value={corruptedMode}
        defaultValue="exclude"
        onValueChange={(mode) =>
          startTransition(() => void setCorruptedMode(mode === "exclude" ? null : mode, together))
        }
      >
        <SegmentedItem value="exclude">Normal</SegmentedItem>
        <SegmentedItem value="only">Corrupted</SegmentedItem>
        <SegmentedItem value="include">Both</SegmentedItem>
      </FilterToggleCell>
    </>
  );
}

/** Whether the top builds of the chosen hero with the included items show beside the table; in the URL. */
export function useTopBuildsOpen() {
  return useQueryState("top_builds", parseAsBoolean.withDefault(false));
}

/**
 * Opens the top builds beside the item table, for the page's filter row. It is there once a hero is chosen and an
 * item included: the builds are that hero's matches with those items.
 */
export function ItemTopBuildsToggle({ hero }: { hero?: number | null }) {
  const [includeItems] = useQueryState("include_items", parseAsSetOf(parseAsInteger).withDefault(new Set()));
  const [open, setOpen] = useTopBuildsOpen();
  if (!hero || includeItems.size === 0) return null;
  return (
    <FilterToggleCell
      label="Top builds"
      value={open ? "shown" : "hidden"}
      defaultValue="hidden"
      onValueChange={(next) => void setOpen(next === "shown" || null)}
    >
      <SegmentedItem value="hidden">Hidden</SegmentedItem>
      <SegmentedItem value="shown">Beside the table</SegmentedItem>
    </FilterToggleCell>
  );
}
