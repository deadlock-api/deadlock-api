import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { Upgrade } from "deadlock_api_client";
import { useMemo, useState } from "react";

import { FlashcardGame } from "~/components/flashcards/FlashcardGame";
import { ItemEffectCard } from "~/components/items-page/ItemEffectCard";
import { Checkbox } from "~/components/ui/checkbox";
import { Label } from "~/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";
import { seo } from "~/lib/seo";
import { filterShopableItems, itemUpgradesFullQueryOptions } from "~/queries/asset-queries";

type Direction = "effects-to-name" | "name-to-effects";

const LEGENDARY_TIER = 5;

export const Route = createFileRoute("/flashcards/item-effects")({
  component: ItemEffectFlashcards,
  head: () =>
    seo({
      title: "Item Effect Flashcards - Learn What Items Do | Deadlock API",
      description:
        "Learn what Deadlock shop items do. Identify items from their stats and effects, or match a named item to its effects.",
      path: "/flashcards/item-effects",
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
  const { data: items, isLoading } = useQuery(itemUpgradesFullQueryOptions);
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
          <Label
            htmlFor="flashcard-exclude-legendary"
            className="flex cursor-pointer items-center gap-2 text-muted-foreground/70 hover:text-foreground"
          >
            <Checkbox
              id="flashcard-exclude-legendary"
              checked={excludeLegendary}
              onCheckedChange={(v) => setExcludeLegendary(v === true)}
            />
            <span>Exclude legendary</span>
          </Label>
          <ToggleGroup
            type="single"
            value={direction}
            onValueChange={(v) => v && setDirection(v as Direction)}
            variant="outline"
            size="sm"
          >
            <ToggleGroupItem value="effects-to-name" className="px-3 text-xs">
              Effects → Name
            </ToggleGroupItem>
            <ToggleGroupItem value="name-to-effects" className="px-3 text-xs">
              Name → Effects
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      }
      isLoading={isLoading}
      storageKey="flashcards:item-effects:no-repeats"
      masteredLabel="All item effects mastered"
    />
  );
}
