import { useQuery } from "@tanstack/react-query";
import type { UpgradeV2 } from "assets_deadlock_api_client/api";

import { ItemImage } from "~/components/ItemImage";
import { ItemName } from "~/components/ItemName";
import { FilteredSelectPopover } from "~/components/selectors/FilteredSelectPopover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { Skeleton } from "~/components/ui/skeleton";
import { itemUpgradesQueryOptions } from "~/queries/asset-queries";

function sortItems(a: UpgradeV2, b: UpgradeV2) {
  if (a.item_tier !== b.item_tier) {
    return a.item_tier - b.item_tier;
  }
  return a.name.localeCompare(b.name);
}

function useItems() {
  const { data: sortedItems = [], isLoading } = useQuery({
    ...itemUpgradesQueryOptions,
    select: (items) => items.filter((i) => !i.disabled && i.shopable && i.shop_image_webp).sort(sortItems),
  });
  return { sortedItems, isLoading };
}

export function ItemSelector({
  onItemSelected,
  selectedItem,
  allowSelectNull,
  label,
}: {
  onItemSelected: (selectedItem: number | null) => void;
  selectedItem?: number | null;
  allowSelectNull?: boolean;
  label?: string;
}) {
  const { sortedItems, isLoading } = useItems();

  const handleValueChange = (value: string) => {
    if (value === "none" || value === "") {
      onItemSelected(null);
    } else {
      onItemSelected(Number(value));
    }
  };

  const selectValue = selectedItem === null || selectedItem === undefined ? "" : String(selectedItem);

  const currentItem = selectedItem ? sortedItems.find((opt: UpgradeV2) => opt.id === selectedItem) : undefined;

  return (
    <div className="flex max-w-[200px] flex-col gap-1.5">
      <div className="flex h-8 items-center justify-center md:justify-start">
        <span className="text-sm font-semibold text-foreground">{label || "Item"}</span>
      </div>
      {isLoading ? (
        <Skeleton className="h-10 w-32" />
      ) : (
        <Select value={selectValue} onValueChange={handleValueChange}>
          <SelectTrigger className="w-full focus-visible:ring-0">
            <SelectValue placeholder={"Select Item..."}>
              {currentItem ? (
                <div className="flex items-center gap-2">
                  <ItemImage itemId={currentItem.id} className="size-4 shrink-0 object-contain" />
                  <ItemName itemId={currentItem.id} />
                </div>
              ) : null}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="flex max-h-[70vh] w-fit flex-row flex-nowrap items-center gap-2 overflow-y-scroll">
            {allowSelectNull && (
              <SelectItem value="none">
                <span className="truncate">None</span>
              </SelectItem>
            )}
            {sortedItems.map((item: UpgradeV2) => (
              <SelectItem key={item.id} value={String(item.id)}>
                <div className="flex flex-nowrap items-center gap-2">
                  <ItemImage itemId={item.id} className="size-5 shrink-0 object-contain" />
                  <ItemName itemId={item.id} />
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

export function ItemSelectorMultiple({
  onItemsSelected,
  selectedItems,
  label,
}: {
  onItemsSelected: (selectedItems: number[]) => void;
  selectedItems: number[];
  label?: string;
}) {
  const { sortedItems, isLoading } = useItems();

  if (isLoading) {
    return null;
  }

  return (
    <FilteredSelectPopover
      items={sortedItems}
      selectedIds={selectedItems}
      onSelectedIdsChange={onItemsSelected}
      getId={(item: UpgradeV2) => item.id}
      emptyLabel={label ?? "Select Items..."}
      renderChip={(itemId) => (
        <>
          <ItemImage itemId={itemId} className="size-4 shrink-0 object-contain" />
          <ItemName itemId={itemId} className="truncate text-xs" />
        </>
      )}
      renderRow={(item: UpgradeV2) => (
        <>
          <ItemImage itemId={item.id} className="size-5 shrink-0 object-contain" />
          <ItemName itemId={item.id} className="truncate text-sm" />
        </>
      )}
    />
  );
}
