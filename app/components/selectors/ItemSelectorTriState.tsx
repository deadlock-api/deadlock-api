import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { ItemImage } from "~/components/ItemImage";
import { type TriState, type TriStateColumnLayout, TriStateSelector } from "~/components/selectors/TriStateSelector";
import { itemUpgradesQueryOptions } from "~/queries/asset-queries";

const ITEM_COLUMN_LAYOUT: TriStateColumnLayout = {
  superGroups: [1, 2, 3, 4].map((tier) => ({ key: String(tier), label: `Tier ${tier}` })),
  columns: [
    { key: "weapon", label: "Weapon", color: "rgb(229, 138, 0)" },
    { key: "vitality", label: "Vitality", color: "rgb(0, 255, 153)" },
    { key: "spirit", label: "Spirit", color: "rgb(0, 221, 255)" },
  ],
};

export function ItemSelectorTriState({
  selections,
  onSelectionsChange,
  label,
}: {
  selections: Map<number, TriState>;
  onSelectionsChange: (selections: Map<number, TriState>) => void;
  label?: string;
}) {
  const { data, isLoading } = useQuery(itemUpgradesQueryOptions);

  const options = useMemo(() => {
    if (!data) return [];
    return data
      ?.filter((i) => !i.disabled && i.shopable && i.shop_image_webp)
      .sort((a, b) => {
        if (a.item_tier !== b.item_tier) return a.item_tier - b.item_tier;
        const slotOrder = ["weapon", "vitality", "spirit"];
        const slotDiff = slotOrder.indexOf(a.item_slot_type) - slotOrder.indexOf(b.item_slot_type);
        if (slotDiff !== 0) return slotDiff;
        return a.name.localeCompare(b.name);
      })
      .map((item) => ({
        id: item.id,
        label: item.name,
        icon: <ItemImage itemId={item.id} className="size-5 object-contain shrink-0" />,
        group: `${item.item_tier}-${item.item_slot_type}`,
      }));
  }, [data]);

  if (isLoading) return null;

  return (
    <TriStateSelector
      options={options}
      selections={selections}
      onSelectionsChange={onSelectionsChange}
      placeholder="Filter items..."
      label={label || "Items"}
      columnLayout={ITEM_COLUMN_LAYOUT}
    />
  );
}
