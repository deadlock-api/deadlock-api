import { useQuery } from "@tanstack/react-query";
import type { UpgradeV2 } from "assets_deadlock_api_client/api";
import { useMemo } from "react";
import ItemImage from "~/components/ItemImage";
import { type TriState, type TriStateGroupStyle, TriStateSelector } from "~/components/selectors/TriStateSelector";
import { assetsApi } from "~/lib/assets-api";

const ITEM_CATEGORY_STYLES: Record<string, TriStateGroupStyle> = {
  weapon: { label: "Weapon", color: "rgb(229, 138, 0)" },
  vitality: { label: "Vitality", color: "rgb(0, 255, 153)" },
  spirit: { label: "Spirit", color: "rgb(0, 221, 255)" },
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
  const { data, isLoading } = useQuery({
    queryKey: ["assets-items"],
    queryFn: async () => {
      const response = await assetsApi.items_api.getItemsByTypeV2ItemsByTypeTypeGet({ type: "upgrade" });
      return response.data as UpgradeV2[];
    },
    staleTime: Number.POSITIVE_INFINITY,
  });

  const options = useMemo(() => {
    if (!data) return [];
    return data
      ?.filter((i) => !i.disabled && i.shopable && i.shop_image_webp)
      .sort((a, b) => {
        const slotOrder = ["weapon", "vitality", "spirit"];
        const slotDiff = slotOrder.indexOf(a.item_slot_type) - slotOrder.indexOf(b.item_slot_type);
        if (slotDiff !== 0) return slotDiff;
        if (a.item_tier !== b.item_tier) return a.item_tier - b.item_tier;
        return a.name.localeCompare(b.name);
      })
      .map((item) => ({
        id: item.id,
        label: item.name,
        icon: <ItemImage itemId={item.id} className="size-5 object-contain shrink-0" />,
        group: item.item_slot_type as string,
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
      groupStyles={ITEM_CATEGORY_STYLES}
    />
  );
}
