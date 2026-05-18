import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { ItemImage } from "~/components/ItemImage";
import { type TriState, type TriStateColumnLayout, TriStateSelector } from "~/components/selectors/TriStateSelector";
import { itemUpgradesQueryOptions } from "~/queries/asset-queries";

import { createFilter } from "./createFilter";

const ITEM_COLUMN_LAYOUT: TriStateColumnLayout = {
  superGroups: [1, 2, 3, 4].map((tier) => ({
    key: String(tier),
    label: `Tier ${tier}`,
  })),
  columns: [
    { key: "weapon", label: "Weapon", color: "rgb(229, 138, 0)" },
    { key: "vitality", label: "Vitality", color: "rgb(0, 255, 153)" },
    { key: "spirit", label: "Spirit", color: "rgb(0, 221, 255)" },
  ],
};

function formatItemSelections(selections: Map<number, TriState>): string | null {
  if (selections.size === 0) return null;
  const included = [...selections.values()].filter((v) => v === "included").length;
  const excluded = [...selections.values()].filter((v) => v === "excluded").length;
  const parts: string[] = [];
  if (included > 0) parts.push(`${included} included`);
  if (excluded > 0) parts.push(`${excluded} excluded`);
  return `${parts.join(", ")} items`;
}

export const ItemsTriStateFilter = createFilter<{
  selections: Map<number, TriState>;
  onSelectionsChange: (selections: Map<number, TriState>) => void;
  label?: string;
}>({
  useDescription(props) {
    return { items: formatItemSelections(props.selections) };
  },
  Render({ selections, onSelectionsChange, label }) {
    const { data, isLoading } = useQuery(itemUpgradesQueryOptions);

    const options = useMemo(() => {
      if (!data) return [];
      return data
        .filter((i) => !i.disabled && i.shopable && i.shop_image_webp)
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
          icon: <ItemImage itemId={item.id} className="size-5 shrink-0 object-contain" />,
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
  },
});
