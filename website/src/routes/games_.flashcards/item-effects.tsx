import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { Upgrade } from "deadlock_api_client";
import { useMemo, useState } from "react";

import { FlashcardGame } from "~/components/features/flashcards/FlashcardGame";
import { ItemEffectCard } from "~/components/features/items/ItemEffectCard";
import { CheckboxField } from "~/components/ui/checkbox-field";
import { Segmented, SegmentedItem } from "~/components/ui/segmented";
import { seo } from "~/lib/seo";
import { filterShopableItems, itemUpgradesFullQueryOptions } from "~/queries/asset-queries";

type Direction = "effects-to-name" | "name-to-effects";

const LEGENDARY_TIER = 5;

export const Route = createFileRoute("/games_/flashcards/item-effects")({
  component: ItemEffectFlashcards,
  head: () =>
    seo({
      title: "Item Effect Flashcards - Learn What Items Do | Deadlock API",
      description:
        "Learn what Deadlock shop items do. Identify items from their stats and effects, or match a named item to its effects.",
      path: "/games/flashcards/item-effects",
    }),
});

function ItemNameOption({ item }: { item: Upgrade }) {
  return (
    <span className="flex min-w-0 items-center gap-3">
      <img src={item.shop_image_webp ?? ""} alt="" className="size-8 shrink-0 object-contain" draggable={false} />
      <span className="truncate tracking-wide uppercase">{item.name}</span>
    </span>
  );
}

function ItemEffectFlashcards() {
  const { data: items, isLoading, isError, isFetching, refetch } = useQuery(itemUpgradesFullQueryOptions);
  const [direction, setDirection] = useState<Direction>("effects-to-name");
  const [excludeLegendary, setExcludeLegendary] = useState(false);

  const pool = useMemo(() => {
    if (!items) return [];
    return filterShopableItems(items).filter(
      (item) => (item.tooltip_sections?.length ?? 0) > 0 && !(excludeLegendary && item.item_tier === LEGENDARY_TIER),
    );
  }, [items, excludeLegendary]);

  const effectsToName = direction === "effects-to-name";

  return (
    <FlashcardGame
      title="Item Effect Flashcards"
      subtitle={
        effectsToName
          ? "Identify the shop item from its stats and effects. Pick the correct name."
          : "Pick the stats and effects that belong to the named item."
      }
      pool={pool}
      promptClassName="w-full max-w-xl"
      reshuffleKey={`${direction}:${excludeLegendary}`}
      renderPrompt={(item) =>
        effectsToName ? (
          <ItemEffectCard item={item} className="p-5" hideName />
        ) : (
          <div className="flex items-center gap-4 p-5">
            <img
              src={item.shop_image_webp ?? ""}
              alt={item.name}
              className="size-16 shrink-0 object-contain"
              draggable={false}
            />
            <span className="font-game text-2xl tracking-tight uppercase">{item.name}</span>
          </div>
        )
      }
      renderOption={
        effectsToName
          ? (item) => <ItemNameOption item={item} />
          : (item) => <ItemEffectCard item={item} className="w-full py-1 font-normal" hideName />
      }
      controls={
        <div className="flex flex-wrap items-center gap-4">
          <CheckboxField
            id="flashcard-exclude-legendary"
            label="Exclude legendary"
            checked={excludeLegendary}
            onCheckedChange={(v) => setExcludeLegendary(v === true)}
            size="sm"
            className="items-center"
          />
          <Segmented aria-label="Card direction" value={direction} onValueChange={setDirection} width="hug">
            <SegmentedItem value="effects-to-name">Effects → Name</SegmentedItem>
            <SegmentedItem value="name-to-effects">Name → Effects</SegmentedItem>
          </Segmented>
        </div>
      }
      isLoading={isLoading}
      isError={isError}
      onRetry={() => void refetch()}
      retrying={isFetching}
      deck="item-effects"
      masteredLabel="All item effects mastered"
    />
  );
}
