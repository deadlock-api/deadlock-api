import { ItemImage } from "~/components/domain/assets/ItemImage";
import { type ItemSlotTab, SLOT_TAB_LABEL } from "~/components/domain/selectors/item-picker";
import type { ItemPicker } from "~/components/domain/selectors/useItemPicker";
import {
  markPickerGridGroup,
  PickerGrid,
  PickerGridGroup,
  PickerGridSearch,
  PickerGridTile,
} from "~/components/patterns/picker/PickerGrid";
import { Badge } from "~/components/ui/badge";
import { SCROLLBAR_THIN } from "~/components/ui/recipes";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { cn } from "~/lib/utils";
import type { SlimUpgrade } from "~/queries/asset-queries";

const TABS: readonly ItemSlotTab[] = ["all", "weapon", "vitality", "spirit"];

/**
 * The item shop of a picker: a `PickerGrid` of item icons with their names, five a row. Its behaviour comes from
 * `useItemPicker` through `picker`; its children are one `ItemGridTier` per group of `picker.groups`, each holding one
 * `ItemGridTile` per item. Without tiles it says that no item matches the search.
 */
export function ItemGrid({
  picker,
  "aria-label": ariaLabel = "Items",
  ...props
}: Omit<React.ComponentProps<typeof PickerGrid>, "picker" | "size" | "emptyLabel"> & { picker: ItemPicker }) {
  const term = picker.search.trim();
  return (
    <PickerGrid
      picker={picker}
      size="lg"
      aria-label={ariaLabel}
      emptyLabel={term ? `No item matches “${term}”.` : "No items."}
      {...props}
    />
  );
}

/** One tier of an `ItemGrid`: the heading "Tier 1 · 800 souls" (the cost comes from the items) over its tiles. */
export function ItemGridTier({
  tier,
  cost,
  ...props
}: Omit<React.ComponentProps<typeof PickerGridGroup>, "label" | "hint"> & {
  tier: number;
  cost?: number;
}) {
  return (
    <PickerGridGroup
      label={`Tier ${tier}`}
      hint={cost !== undefined ? `${cost.toLocaleString("en-US")} souls` : undefined}
      {...props}
    />
  );
}

markPickerGridGroup(ItemGridTier);

/**
 * One item of an `ItemGrid`: its icon and name, with the state marks of `PickerGridTile`. Children are an extra line
 * under the name, such as a win rate. Props and `ref` reach the button.
 */
export function ItemGridTile({
  item,
  ...props
}: Omit<React.ComponentProps<typeof PickerGridTile>, "choice" | "media"> & { item: SlimUpgrade }) {
  return <PickerGridTile choice={item} media={<ItemImage item={item} title="" className="size-full" />} {...props} />;
}

/**
 * The search box above an `ItemGrid`: it narrows the items, moving to the All tab while it holds text; Enter picks the
 * first match and ArrowDown moves into the grid. Props reach `SearchInput`.
 */
export function ItemGridSearch({
  placeholder = "Search items…",
  ...props
}: React.ComponentProps<typeof PickerGridSearch>) {
  return <PickerGridSearch aria-label="Search items" placeholder={placeholder} {...props} />;
}

/**
 * The shop's slot tabs (All, Weapon, Vitality, Spirit) around the `ItemGrid` of the chosen tab, which scrolls on its
 * own. A tab with chosen items carries their count. Children are the grid.
 */
export function ItemSlotTabs({
  picker,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<typeof Tabs>, "value" | "defaultValue" | "onValueChange"> & {
  picker: Pick<ItemPicker, "slot" | "setSlot" | "chosenPerSlot">;
}) {
  return (
    <Tabs
      value={picker.slot}
      onValueChange={(next) => picker.setSlot(next as ItemSlotTab)}
      className={cn("min-h-0 gap-0", className)}
      {...props}
    >
      <div className="px-2 pt-2">
        <TabsList className="w-full" aria-label="Item slot">
          {TABS.map((tab) => {
            const count = picker.chosenPerSlot[tab];
            return (
              <TabsTrigger key={tab} value={tab} className="px-1.5">
                {SLOT_TAB_LABEL[tab]}
                {count > 0 && (
                  <Badge size="sm" variant="secondary">
                    {count}
                    <span className="sr-only"> chosen</span>
                  </Badge>
                )}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </div>
      <TabsContent value={picker.slot} tabIndex={-1} className={cn(SCROLLBAR_THIN, "max-h-80 overflow-y-auto p-2")}>
        {children}
      </TabsContent>
    </Tabs>
  );
}
