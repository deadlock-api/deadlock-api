import { useState } from "react";

import { ItemImage } from "~/components/domain/assets/ItemImage";
import type { ItemSlotTab } from "~/components/domain/selectors/item-picker";
import {
  ItemGrid,
  ItemGridSearch,
  ItemGridTier,
  ItemGridTile,
  ItemSlotTabs,
} from "~/components/domain/selectors/ItemGrid";
import {
  type ItemPickerOptions,
  type ItemSelectionProps,
  useItemPicker,
  useShopItems,
} from "~/components/domain/selectors/useItemPicker";
import { FilterCell, type FilterCellPassthroughProps } from "~/components/patterns/filter-bar/FilterCell";
import { countSummary, type PickerTriState, triStateSummary } from "~/components/patterns/picker/picker";
import { Button } from "~/components/ui/button";
import { OptionRow } from "~/components/ui/option-row";
import { cn } from "~/lib/utils";
import type { SlimUpgrade } from "~/queries/asset-queries";

type ItemSelectorProps = Omit<FilterCellPassthroughProps, "icon"> & {
  /** The cell's label: "Item" for one item, "Items" otherwise. */
  label?: string;
  /** The slot tab the popover opens on. */
  defaultSlot?: ItemSlotTab;
} & (
    | (Extract<ItemSelectionProps, { selection?: "single" }> & {
        /** Adds "Any item" above the grid: the value `null`. */
        allowNull?: boolean;
        emptyLabel?: never;
      })
    | (Extract<ItemSelectionProps, { selection: "multiple" }> & {
        allowNull?: never;
        /** The cell's value with no item chosen. */
        emptyLabel?: string;
      })
    | (Extract<ItemSelectionProps, { selection: "tri-state" }> & { allowNull?: never; emptyLabel?: never })
  );

/** The chosen items of a list or tri-state picker, as small icons under the grid, so the other tabs' picks show too. */
function ChosenItems({ label, items }: { label: string; items: readonly SlimUpgrade[] }) {
  if (items.length === 0) return null;
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <span className="text-2xs text-muted-foreground">{label}</span>
      <ul aria-label={`${label} items`} className="flex min-w-0 flex-wrap gap-0.5">
        {items.map((item) => (
          <li key={item.id}>
            <ItemImage item={item} className="size-5" />
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The one item filter: a `FilterCell` whose popover holds a search box, the shop's slot tabs and the items of the tab
 * grouped by tier (`ItemGrid`). `selection` picks what it holds: `single` (one item, closes on a pick; `allowNull`
 * adds "Any item"), `multiple` (a list of items) or `tri-state` (each item included, excluded or neither, as a map).
 * A search looks in every slot. Under the grid a list or tri-state picker shows every chosen item, whichever tab it
 * is on. A `defaultValue` is what the reset returns to and what counts as inactive. In a filter bar use `Filter.Item`;
 * in a toolbar pass `size="sm"`.
 */
export function ItemSelector(props: ItemSelectorProps) {
  const {
    selection = "single",
    value: _value,
    defaultValue,
    onValueChange,
    allowNull,
    emptyLabel,
    defaultSlot,
    label = selection === "single" ? "Item" : "Items",
    contentClassName,
    ...cellProps
  } = props;
  const { items } = useShopItems();
  const [open, setOpen] = useState(false);
  const picker = useItemPicker<SlimUpgrade>({
    selection,
    value: props.value,
    defaultValue,
    items,
    defaultSlot,
    // An item is one choice, so picking it closes the editor like a select would; lists stay open for the next pick.
    onValueChange: (next: unknown) => {
      (onValueChange as ((value: unknown) => void) | undefined)?.(next);
      if (selection === "single") {
        picker.setSearch("");
        setOpen(false);
      }
    },
  } as unknown as ItemPickerOptions<SlimUpgrade>);

  let display: string;
  let active: boolean;
  let firstItem: SlimUpgrade | undefined;
  let reset: (() => void) | undefined;
  let footer: React.ReactNode = null;
  if (selection === "single") {
    const itemId = picker.value as number | null;
    firstItem = items.find((item) => item.id === itemId);
    display = firstItem?.name ?? "Any";
    const initial = (defaultValue as number | null | undefined) ?? null;
    active = itemId !== initial;
    reset = allowNull || initial != null ? () => picker.setSelection(initial) : undefined;
  } else if (selection === "multiple") {
    const ids = picker.value as readonly number[];
    const chosen = items.filter((item) => ids.includes(item.id));
    firstItem = chosen[0];
    display = countSummary(ids.length, { one: "item", other: "items", empty: emptyLabel });
    active = ids.length > 0;
    reset = () => picker.setSelection([]);
    footer = <ChosenItems label="Chosen" items={chosen} />;
  } else {
    const states = picker.value as ReadonlyMap<number, PickerTriState>;
    firstItem = items.find((item) => states.has(item.id));
    display = triStateSummary(states);
    active = states.size > 0;
    reset = () => picker.setSelection(new Map());
    footer = (
      <>
        <ChosenItems label="Included" items={items.filter((item) => states.get(item.id) === "included")} />
        <ChosenItems label="Excluded" items={items.filter((item) => states.get(item.id) === "excluded")} />
      </>
    );
  }

  return (
    <FilterCell
      label={label}
      value={display}
      active={active}
      onReset={reset}
      icon={firstItem ? <ItemImage item={firstItem} aria-hidden title="" className="size-4 shrink-0" /> : undefined}
      contentClassName={cn("w-96 max-w-(--radix-popover-content-available-width) p-0", contentClassName)}
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) picker.setSearch("");
      }}
      {...cellProps}
    >
      <div className="border-b p-2">
        <ItemGridSearch picker={picker} />
      </div>
      {allowNull && !picker.search && (
        <div className="px-2 pt-2">
          <OptionRow selected={picker.value == null} onClick={() => picker.setSelection(null)}>
            Any item
          </OptionRow>
        </div>
      )}
      <ItemSlotTabs picker={picker}>
        <ItemGrid picker={picker} aria-label={label}>
          {picker.groups.map((group) => (
            <ItemGridTier key={group.tier} tier={group.tier} cost={group.cost}>
              {group.items.map((item) => (
                <ItemGridTile key={item.id} item={item} />
              ))}
            </ItemGridTier>
          ))}
        </ItemGrid>
      </ItemSlotTabs>
      {selection !== "single" && (
        <div className="flex flex-col gap-1.5 border-t px-3 py-2">
          {active && (
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 flex-col gap-1">{footer}</div>
              <Button variant="ghost" size="xs" onClick={reset}>
                Clear
              </Button>
            </div>
          )}
          {selection === "tri-state" && (
            <p className="text-2xs text-muted-foreground">
              Press an item once to include it, again to exclude it, a third time to clear it.
            </p>
          )}
        </div>
      )}
    </FilterCell>
  );
}
