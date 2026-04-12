import { useId } from "react";

import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";

interface FilteredSelectPopoverProps<T> {
  /** The full sorted list of items to display. */
  items: T[];
  /** Currently selected item IDs. */
  selectedIds: number[];
  /** Called with the new set of selected IDs whenever selection changes. */
  onSelectedIdsChange: (ids: number[]) => void;
  /** Extract the numeric ID from an item. */
  getId: (item: T) => number;
  /** Render the content inside a chip badge shown in the trigger button. */
  renderChip: (id: number) => React.ReactNode;
  /** Render the label content inside the popover list row. */
  renderRow: (item: T) => React.ReactNode;
  /** Placeholder shown in the trigger when nothing is selected. */
  emptyLabel: string;
}

export function FilteredSelectPopover<T>({
  items,
  selectedIds,
  onSelectedIdsChange,
  getId,
  renderChip,
  renderRow,
  emptyLabel,
}: FilteredSelectPopoverProps<T>) {
  const selectAllId = useId();

  const allSelected = selectedIds.length === items.length;
  const noneSelected = selectedIds.length === 0;
  const indeterminate = !allSelected && !noneSelected;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="box-border h-min max-h-20 min-h-9 w-fit max-w-[250px] min-w-[150px] overflow-hidden p-1"
        >
          <div className="flex flex-wrap items-center justify-start gap-2">
            {noneSelected ? (
              <span className="truncate text-muted-foreground">{emptyLabel}</span>
            ) : (
              selectedIds.slice(0, 5).map((id) => (
                <span key={id} className="flex items-center justify-around gap-1 rounded bg-muted p-0.5 px-1">
                  {renderChip(id)}
                </span>
              ))
            )}
            {selectedIds.length > 5 && (
              <span className="truncate text-muted-foreground">+{selectedIds.length - 5}</span>
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
                  onSelectedIdsChange(items.map(getId));
                } else {
                  onSelectedIdsChange([]);
                }
              }}
              id={selectAllId}
            />
            <label htmlFor={selectAllId} className="cursor-pointer text-sm select-none">
              Select all
            </label>
          </div>
          {items.map((item) => {
            const id = getId(item);
            const rowId = `filtered-select-checkbox-${selectAllId}-${id}`;
            return (
              <div key={id} className="flex cursor-pointer items-center gap-2 px-2 py-1 hover:bg-accent">
                <Checkbox
                  checked={selectedIds.includes(id)}
                  tabIndex={-1}
                  className="mr-2"
                  onCheckedChange={() => {
                    if (selectedIds.includes(id)) {
                      onSelectedIdsChange(selectedIds.filter((x) => x !== id));
                    } else {
                      onSelectedIdsChange([...selectedIds, id]);
                    }
                  }}
                  id={rowId}
                />
                <label
                  htmlFor={rowId}
                  className="flex w-full cursor-pointer flex-nowrap items-center gap-2 truncate text-sm"
                >
                  {renderRow(item)}
                </label>
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
