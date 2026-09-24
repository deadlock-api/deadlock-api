import type { ItemSlotType } from "deadlock_api_client";

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
  const [value, setValue] = useControllableState({
    value: valueProp,
    defaultValue,
    onValueChange,
  });
  return (
    <Field label="Slots" icon={<span aria-hidden="true" className="icon-[mdi--shape] size-3" />} {...props}>
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
    </Field>
  );
}
