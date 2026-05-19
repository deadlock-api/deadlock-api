import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { UpgradeV2 } from "assets_deadlock_api_client";
import { useMemo } from "react";

import { FlashcardGame } from "~/components/flashcards/FlashcardGame";
import { seo } from "~/lib/seo";
import { filterShopableItems, itemUpgradesQueryOptions } from "~/queries/asset-queries";

export const Route = createFileRoute("/flashcards/items")({
  component: ItemFlashcards,
  head: () =>
    seo({
      title: "Item Flashcards - Learn Items by Icon | Deadlock API",
      description: "Memorize Deadlock shop items by their icon. Multiple-choice flashcard drill with instant feedback.",
      path: "/flashcards/items",
    }),
});

function itemIconSrc(item: UpgradeV2): string {
  return item.shop_image_webp ?? "";
}

function ItemFlashcards() {
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
      masteredLabel="All items mastered"
    />
  );
}
