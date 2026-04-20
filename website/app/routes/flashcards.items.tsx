import { useQuery } from "@tanstack/react-query";
import type { UpgradeV2 } from "assets_deadlock_api_client/api";
import { useMemo } from "react";
import type { MetaFunction } from "react-router";

import { createPageMeta } from "~/lib/meta";
import { filterShopableItems, itemUpgradesQueryOptions } from "~/queries/asset-queries";

import { FlashcardGame } from "./flashcards/components/FlashcardGame";

export const meta: MetaFunction = () => {
  return createPageMeta({
    title: "Item Flashcards - Learn Items by Icon | Deadlock API",
    description: "Memorize Deadlock shop items by their icon. Multiple-choice flashcard drill with instant feedback.",
    path: "/flashcards/items",
  });
};

function itemIconSrc(item: UpgradeV2): string {
  return (
    item.shop_image_webp ??
    item.shop_image ??
    item.shop_image_small_webp ??
    item.shop_image_small ??
    item.image_webp ??
    item.image ??
    ""
  );
}

export default function ItemFlashcards() {
  const { data: items, isLoading } = useQuery(itemUpgradesQueryOptions);

  const pool = useMemo(() => {
    if (!items) return [];
    return filterShopableItems(items);
  }, [items]);

  return (
    <FlashcardGame
      title="Item Flashcards"
      subtitle="Identify the shop item from its icon. Pick the correct name."
      pool={pool}
      getIcon={itemIconSrc}
      isLoading={isLoading}
      storageKey="flashcards:items:no-repeats"
      altLabel="Mystery item"
      completionLabel="All items seen"
    />
  );
}
