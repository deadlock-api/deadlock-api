import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { Upgrade } from "deadlock_api_client";
import { useMemo } from "react";

import { FlashcardGame } from "~/components/features/flashcards/FlashcardGame";
import { pageTitle, seo } from "~/lib/seo";
import { filterShopableItems, itemUpgradesQueryOptions } from "~/queries/asset-queries";

export const Route = createFileRoute("/games_/flashcards/items")({
  component: ItemFlashcards,
  head: () =>
    seo({
      title: pageTitle("Item Flashcards - Learn Items by Icon"),
      description: "Memorize Deadlock shop items by their icon. Multiple-choice flashcard drill with instant feedback.",
      path: "/games/flashcards/items",
    }),
});

function itemIconSrc(item: Upgrade): string {
  return item.shop_image_webp ?? "";
}

function ItemFlashcards() {
  const { data: items, isLoading, isError, isFetching, refetch } = useQuery(itemUpgradesQueryOptions);

  const pool = useMemo(() => {
    if (!items) return [];
    return filterShopableItems(items);
  }, [items]);

  return (
    <FlashcardGame
      title="Item Flashcards"
      subtitle="Identify the shop item from its icon. Pick the correct name."
      pool={pool}
      renderPrompt={(entry) => (
        <img src={itemIconSrc(entry)} alt="Mystery item" className="size-full object-contain" draggable={false} />
      )}
      isLoading={isLoading}
      isError={isError}
      onRetry={() => void refetch()}
      retrying={isFetching}
      deck="items"
      masteredLabel="All items mastered"
    />
  );
}
