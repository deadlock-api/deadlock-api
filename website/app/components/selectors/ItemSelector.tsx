import { useQuery } from "@tanstack/react-query";
import type { UpgradeV2 } from "assets_deadlock_api_client/api";
import { useId } from "react";

import { ItemImage } from "~/components/ItemImage";
import { ItemName } from "~/components/ItemName";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
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
  const selectAllId = useId();

  if (isLoading) {
    return "";
  }

  const allSelected = selectedItems.length === sortedItems.length;
  const noneSelected = selectedItems.length === 0;
  const indeterminate = !allSelected && !noneSelected;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="box-border h-min max-h-20 min-h-9 w-fit max-w-[250px] min-w-[150px] overflow-hidden p-1"
        >
          <div className="flex flex-wrap items-center justify-start gap-2">
            {selectedItems.length === 0 ? (
              <span className="truncate text-muted-foreground">{label || "Select Items..."}</span>
            ) : (
              selectedItems.slice(0, 5).map((itemId) => (
                <span key={itemId} className="flex items-center justify-around gap-1 rounded bg-muted p-0.5 px-1">
                  <ItemImage itemId={itemId} className="size-4 shrink-0 object-contain" />
                  <ItemName itemId={itemId} className="truncate text-xs" />
                </span>
              ))
            )}
            {selectedItems.length > 5 && (
              <span className="truncate text-muted-foreground">+{selectedItems.length - 5}</span>
            )}
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="max-h-[400px] w-[220px] overflow-y-auto p-2">
        <div className="flex flex-col gap-1">
          <div className="mb-1 flex items-center gap-2 border-b px-2 py-1">
            <Checkbox
              checked={allSelected ? true : indeterminate ? "indeterminate" : false}
              onCheckedChange={(checked) => {
                if (checked) {
                  onItemsSelected(sortedItems.map((item: UpgradeV2) => item.id));
                } else {
                  onItemsSelected([]);
                }
              }}
              id={`${selectAllId}-select-all`}
            />
            <label htmlFor={`${selectAllId}-select-all`} className="cursor-pointer text-sm select-none">
              Select all
            </label>
          </div>
          {sortedItems.map((item: UpgradeV2) => (
            <div key={item.id} className="flex cursor-pointer items-center gap-2 px-2 py-1 hover:bg-accent">
              <Checkbox
                checked={selectedItems.includes(item.id)}
                tabIndex={-1}
                className="mr-2"
                onCheckedChange={() => {
                  if (selectedItems.includes(item.id)) {
                    onItemsSelected(selectedItems.filter((id: number) => id !== item.id));
                  } else {
                    onItemsSelected([...selectedItems, item.id]);
                  }
                }}
                id={`item-checkbox-${item.id}`}
              />
              <label
                htmlFor={`item-checkbox-${item.id}`}
                className="flex w-full cursor-pointer flex-nowrap items-center gap-2 truncate text-sm"
              >
                <ItemImage itemId={item.id} className="size-5 shrink-0 object-contain" />
                <ItemName itemId={item.id} className="truncate text-sm" />
              </label>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
