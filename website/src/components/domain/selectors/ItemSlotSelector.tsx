import type { ItemSlotType } from "deadlock_api_client";

import { Field } from "~/components/ui/field";
import { useControllableState } from "~/components/ui/hooks/use-controllable-state";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";

export const ITEM_SLOTS = ["weapon", "vitality", "spirit"] as const satisfies readonly ItemSlotType[];

const SLOT_LABELS: Record<ItemSlotType, string> = { weapon: "Weapon", vitality: "Vitality", spirit: "Spirit" };
const ALL_SLOTS: ItemSlotType[] = [...ITEM_SLOTS];

/** Which shop slots to show: every pressed slot is kept. */
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
        value={value}
        onValueChange={(slots) => setValue(slots as ItemSlotType[])}
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
