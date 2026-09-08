import type { ItemSlotType } from "deadlock_api_client";

import { Button } from "~/components/ui/button";

export const ITEM_SLOTS = ["weapon", "vitality", "spirit"] as const satisfies readonly ItemSlotType[];

const SLOT_LABELS: Record<ItemSlotType, string> = { weapon: "Weapon", vitality: "Vitality", spirit: "Spirit" };

export function ItemSlotSelector({
  selectedSlots,
  onSlotsSelected,
}: {
  selectedSlots: ItemSlotType[];
  onSlotsSelected: (slots: ItemSlotType[]) => void;
}) {
  const handleToggle = (slot: ItemSlotType) => {
    onSlotsSelected(selectedSlots.includes(slot) ? selectedSlots.filter((s) => s !== slot) : [...selectedSlots, slot]);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <span className="icon-[mdi--shape] size-4 text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">Slots</p>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {ITEM_SLOTS.map((slot) => (
          <Button
            key={slot}
            variant={selectedSlots.includes(slot) ? "default" : "secondary"}
            size="xs"
            onClick={() => handleToggle(slot)}
            aria-pressed={selectedSlots.includes(slot)}
          >
            {SLOT_LABELS[slot]}
          </Button>
        ))}
      </div>
    </div>
  );
}
