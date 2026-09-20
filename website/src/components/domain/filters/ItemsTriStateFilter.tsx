import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { ItemImage } from "~/components/domain/assets/ItemImage";
import {
  type TriState,
  TriStateGroup,
  TriStateItem,
  TriStateSection,
  TriStateSelector,
} from "~/components/patterns/filter-bar/TriStateSelector";
import { useControllableState } from "~/components/ui/hooks/use-controllable-state";
import { itemUpgradesQueryOptions } from "~/queries/asset-queries";

const TIERS = [1, 2, 3, 4];

const SLOTS = [
  { key: "weapon", label: "Weapon", color: "var(--item-weapon)" },
  { key: "vitality", label: "Vitality", color: "var(--item-vitality)" },
  { key: "spirit", label: "Spirit", color: "var(--item-spirit)" },
];

const NO_SELECTIONS: Map<number, TriState> = new Map();

export function ItemsTriStateFilter({
  value: valueProp,
  defaultValue = NO_SELECTIONS,
  onValueChange,
  label,
  icon,
  ...props
}: Omit<React.ComponentProps<typeof TriStateSelector>, "value" | "defaultValue" | "onValueChange" | "children"> & {
  /** Item id to included / excluded. */
  value?: Map<number, TriState>;
  defaultValue?: Map<number, TriState>;
  onValueChange?: (value: Map<number, TriState>) => void;
}) {
  const [value, setValue] = useControllableState({
    value: valueProp,
    defaultValue,
    onValueChange,
  });
  const { data, isLoading } = useQuery(itemUpgradesQueryOptions);

  const items = useMemo(() => {
    if (!data) return [];
    return data
      .filter((i) => !i.disabled && i.shopable && i.shop_image_webp)
      .sort((a, b) => {
        if (a.item_tier !== b.item_tier) return a.item_tier - b.item_tier;
        const slotOrder = SLOTS.map((slot) => slot.key);
        const slotDiff = slotOrder.indexOf(a.item_slot_type) - slotOrder.indexOf(b.item_slot_type);
        if (slotDiff !== 0) return slotDiff;
        return a.name.localeCompare(b.name);
      })
      .map((item) => ({ id: item.id, name: item.name, group: `${item.item_tier}-${item.item_slot_type}` }));
  }, [data]);

  if (isLoading) return null;

  const firstSelected = items.find((item) => value.has(item.id));

  return (
    <TriStateSelector
      value={value}
      onValueChange={setValue}
      label={label || "Items"}
      size="lg"
      icon={
        icon ?? (firstSelected && <ItemImage itemId={firstSelected.id} className="size-5 shrink-0 object-contain" />)
      }
      {...props}
    >
      {TIERS.map((tier) => (
        <TriStateSection key={tier} label={`Tier ${tier}`}>
          {SLOTS.map((slot) => (
            <TriStateGroup key={slot.key} label={slot.label} color={slot.color}>
              {items
                .filter((item) => item.group === `${tier}-${slot.key}`)
                .map((item) => (
                  <TriStateItem
                    key={item.id}
                    value={item.id}
                    label={item.name}
                    icon={<ItemImage itemId={item.id} className="size-5 shrink-0 object-contain" />}
                  />
                ))}
            </TriStateGroup>
          ))}
        </TriStateSection>
      ))}
    </TriStateSelector>
  );
}
