import type { ItemSlotType } from "deadlock_api_client";
import { ShapesIcon } from "lucide-react";
import { use } from "react";

import { FilterCell, FilterRootContext } from "~/components/patterns/filter-bar/FilterCell";
import { Field } from "~/components/ui/field";
import { anyPressed, anyValue } from "~/components/ui/hooks/any-selection";
import { useControllableState } from "~/components/ui/hooks/use-controllable-state";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";

export const ITEM_SLOTS = ["weapon", "vitality", "spirit"] as const satisfies readonly ItemSlotType[];

const SLOT_LABELS: Record<ItemSlotType, string> = { weapon: "Weapon", vitality: "Vitality", spirit: "Spirit" };
const ALL_SLOTS: ItemSlotType[] = [...ITEM_SLOTS];

/** Which shop slots to show: the pressed ones, or every slot while none is pressed. */
export function ItemSlotSelector({
  value: valueProp,
  defaultValue = ALL_SLOTS,
  onValueChange,
  disabled = false,
  ...props
}: Omit<React.ComponentProps<typeof Field>, "label" | "icon" | "children" | "defaultValue"> & {
  value?: ItemSlotType[];
  defaultValue?: ItemSlotType[];
  onValueChange?: (slots: ItemSlotType[]) => void;
  disabled?: boolean;
}) {
  const inRoot = use(FilterRootContext);
  const [value, setValue] = useControllableState({
    value: valueProp,
    defaultValue,
    onValueChange,
  });
  const group = (
    <ToggleGroup
      type="multiple"
      variant="outline"
      disabled={disabled}
      value={anyPressed(ITEM_SLOTS, value)}
      onValueChange={(slots) => setValue(anyValue(ITEM_SLOTS, slots as ItemSlotType[]))}
    >
      {ITEM_SLOTS.map((slot) => (
        <ToggleGroupItem key={slot} value={slot}>
          {SLOT_LABELS[slot]}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
  // In a page's filter row: a chip like every other filter there, the slots in its popover.
  if (inRoot) {
    const pressed = anyPressed(ITEM_SLOTS, value);
    return (
      <FilterCell
        label="Slots"
        value={pressed.length === 0 ? "All" : pressed.map((slot) => SLOT_LABELS[slot]).join(", ")}
        active={pressed.length > 0}
        onReset={() => setValue(ALL_SLOTS)}
        contentClassName="w-auto"
      >
        {group}
      </FilterCell>
    );
  }
  return (
    <Field label="Slots" icon={<ShapesIcon aria-hidden="true" className="size-3.5 shrink-0" />} {...props}>
      {group}
    </Field>
  );
}
