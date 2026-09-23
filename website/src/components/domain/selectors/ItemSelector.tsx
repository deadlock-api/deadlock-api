import { useQuery } from "@tanstack/react-query";
import type { Upgrade } from "deadlock_api_client";

import { ItemImage } from "~/components/domain/assets/ItemImage";
import { ItemName } from "~/components/domain/assets/ItemName";
import { FilteredSelectOption, FilteredSelectPopover } from "~/components/patterns/filter-bar/FilteredSelectPopover";
import { useControllableState } from "~/components/ui/hooks/use-controllable-state";
import { filterShopableItems, itemUpgradesQueryOptions } from "~/queries/asset-queries";

function sortItems(a: Upgrade, b: Upgrade) {
  if (a.item_tier !== b.item_tier) {
    return a.item_tier - b.item_tier;
  }
  return a.name.localeCompare(b.name);
}

function useItems() {
  const { data: sortedItems = [], isLoading } = useQuery({
    ...itemUpgradesQueryOptions,
    select: (items) => filterShopableItems(items).sort(sortItems),
  });
  return { sortedItems, isLoading };
}

const NO_ITEMS: number[] = [];

export function ItemSelectorMultiple({
  value: valueProp,
  defaultValue = NO_ITEMS,
  onValueChange,
  ...props
}: Omit<
  React.ComponentProps<typeof FilteredSelectPopover>,
  "value" | "defaultValue" | "onValueChange" | "children" | "emptyLabel"
> & {
  value?: number[];
  defaultValue?: number[];
  onValueChange?: (itemIds: number[]) => void;
}) {
  const [selectedItems, onItemsSelected] = useControllableState({
    value: valueProp,
    defaultValue,
    onValueChange,
  });
  const { sortedItems, isLoading } = useItems();

  if (isLoading) {
    return null;
  }

  return (
    <FilteredSelectPopover
      value={selectedItems}
      onValueChange={onItemsSelected}
      emptyLabel="Select Items..."
      {...props}
    >
      {sortedItems.map((item: Upgrade) => (
        // The trigger draws these children in the chip of a chosen item too, so the text size is inherited.
        <FilteredSelectOption key={item.id} value={item.id} textValue={item.name}>
          <ItemImage itemId={item.id} className="size-4 shrink-0 object-contain" />
          <ItemName itemId={item.id} className="truncate" />
        </FilteredSelectOption>
      ))}
    </FilteredSelectPopover>
  );
}
