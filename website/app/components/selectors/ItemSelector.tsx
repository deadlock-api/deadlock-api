import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import ItemImage from "~/components/ItemImage";
import ItemName from "~/components/ItemName";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { Skeleton } from "~/components/ui/skeleton";
import { ASSETS_ORIGIN } from "~/lib/constants";
import type { AssetsItem } from "~/types/assets_item";

export default function ItemSelector({
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
  const { data, isLoading } = useQuery<AssetsItem[]>({
    queryKey: ["assets-items"],
    queryFn: () => fetch(new URL("/v2/items/by-type/upgrade", ASSETS_ORIGIN)).then((res) => res.json()),
    staleTime: Number.POSITIVE_INFINITY,
  });

  const sortedItemes = useMemo(
    () => data?.filter((i) => !i.disabled).sort((a: AssetsItem, b: AssetsItem) => a.name.localeCompare(b.name)) ?? [],
    [data],
  );

  const handleValueChange = (value: string) => {
    if (value === "none" || value === "") {
      onItemSelected(null);
    } else {
      onItemSelected(Number(value));
    }
  };

  const selectValue = selectedItem === null || selectedItem === undefined ? "" : String(selectedItem);

  const currentItem = selectedItem ? sortedItemes.find((opt: AssetsItem) => opt.id === selectedItem) : undefined;

  return (
    <div className="flex flex-col gap-1.5 w-full max-w-[200px]">
      <div className="flex justify-center md:justify-start items-center h-8">
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
                  <ItemImage itemId={currentItem.id} className="size-4 object-contain flex-shrink-0" />
                  <ItemName itemId={currentItem.id} />
                </div>
              ) : null}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {allowSelectNull && (
              <SelectItem value="none">
                <span className="truncate">None</span>
              </SelectItem>
            )}
            {sortedItemes.map((item: AssetsItem) => (
              <SelectItem key={item.id} value={String(item.id)}>
                <ItemImage itemId={item.id} className="size-5 object-contain flex-shrink-0" />
                <ItemName itemId={item.id} />
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

export function ItemSelectorMultiple({
  onItemesSelected,
  selectedItemes,
  label,
}: {
  onItemesSelected: (selectedItemes: number[]) => void;
  selectedItemes: number[];
  label?: string;
}) {
  const { data, isLoading } = useQuery<AssetsItem[]>({
    queryKey: ["assets-items"],
    queryFn: () => fetch(new URL("/v2/items/by-type/upgrade", ASSETS_ORIGIN)).then((res) => res.json()),
    staleTime: Number.POSITIVE_INFINITY,
  });

  const sortedItemes = useMemo(
    () => data?.filter((i) => !i.disabled).sort((a: AssetsItem, b: AssetsItem) => a.name.localeCompare(b.name)) ?? [],
    [data],
  );

  if (isLoading) {
    return "";
  }

  const allSelected = selectedItemes.length === sortedItemes.length;
  const noneSelected = selectedItemes.length === 0;
  const indeterminate = !allSelected && !noneSelected;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="w-fit min-w-[150px] max-w-[250px] overflow-hidden max-h-20 min-h-9 h-min p-1 box-border"
        >
          <div className="flex flex-wrap gap-2 items-center justify-start">
            {selectedItemes.length === 0 ? (
              <span className="truncate text-muted-foreground">{label || "Select Itemes..."}</span>
            ) : (
              selectedItemes
                .map((itemId) => (
                  <span key={itemId} className="flex items-center justify-around gap-1 bg-muted rounded px-1 p-0.5">
                    <ItemImage itemId={itemId} className="size-4 object-contain flex-shrink-0" />
                    <ItemName itemId={itemId} className="truncate text-xs" />
                  </span>
                ))
                .slice(0, 5)
            )}
            {selectedItemes.length > 5 && (
              <span className="truncate text-muted-foreground">+{selectedItemes.length - 5}</span>
            )}
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[220px] max-h-[400px] overflow-y-auto p-2">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 px-2 py-1 border-b mb-1">
            <Checkbox
              checked={allSelected ? true : indeterminate ? "indeterminate" : false}
              onCheckedChange={(checked) => {
                if (checked) {
                  onItemesSelected(sortedItemes.map((item: AssetsItem) => item.id));
                } else {
                  onItemesSelected([]);
                }
              }}
              id="select-all-items"
            />
            <label htmlFor="select-all-items" className="text-sm cursor-pointer select-none">
              Select all
            </label>
          </div>
          {sortedItemes.map((item: AssetsItem) => (
            <div key={item.id} className="flex items-center gap-2 px-2 py-1 hover:bg-accent cursor-pointer">
              <Checkbox
                checked={selectedItemes.includes(item.id)}
                tabIndex={-1}
                className="mr-2"
                onCheckedChange={() => {
                  if (selectedItemes.includes(item.id)) {
                    onItemesSelected(selectedItemes.filter((id: number) => id !== item.id));
                  } else {
                    onItemesSelected([...selectedItemes, item.id]);
                  }
                }}
                id={`item-checkbox-${item.id}`}
              />
              <label
                htmlFor={`item-checkbox-${item.id}`}
                className="flex flex-nowrap items-center gap-2 w-full truncate text-sm cursor-pointer"
              >
                <ItemImage itemId={item.id} className="size-5 object-contain flex-shrink-0" />
                <ItemName itemId={item.id} className="truncate text-sm" />
              </label>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
