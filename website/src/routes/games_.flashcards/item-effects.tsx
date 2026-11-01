import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { Upgrade } from "deadlock_api_client";
import { useMemo, useState } from "react";

import {
  FlashcardGame,
  FlashcardOptions,
  FlashcardPrompt,
  useFlashcardEntry,
} from "~/components/features/flashcards/FlashcardGame";
import { ItemEffectCard } from "~/components/features/items/ItemEffectCard";
import { CheckboxField } from "~/components/ui/checkbox-field";
import { Segmented, SegmentedItem } from "~/components/ui/segmented";
import { giveawayNameWords } from "~/lib/item-name-mask";
import { pageTitle, seo } from "~/lib/seo";
import { filterShopableItems, itemUpgradesFullQueryOptions } from "~/queries/asset-queries";

type Direction = "effects-to-name" | "name-to-effects";

const LEGENDARY_TIER = 5;

export const Route = createFileRoute("/games_/flashcards/item-effects")({
  component: ItemEffectFlashcards,
  head: () =>
    seo({
      title: pageTitle("Item Effect Flashcards - Learn What Items Do"),
      description:
        "Learn what Deadlock shop items do. Identify items from their stats and effects, or match a named item to its effects.",
      path: "/games/flashcards/item-effects",
    }),
});

/** The prompt: the item's effects to name it from, or its name to find its effects for. */
function ItemPrompt({ direction, hiddenWords }: { direction: Direction; hiddenWords: Map<number, string[]> }) {
  const item = useFlashcardEntry<Upgrade>();
  if (direction === "effects-to-name") {
    return <ItemEffectCard item={item} className="p-5" hideName hiddenWords={hiddenWords.get(item.id)} />;
  }
  return (
    <div className="flex items-center gap-4 p-5">
      <img src={item.shop_image_webp ?? ""} alt="" className="size-16 shrink-0 object-contain" draggable={false} />
      <span className="font-game text-2xl tracking-tight uppercase">{item.name}</span>
    </div>
  );
}

function ItemNameOption() {
  const item = useFlashcardEntry<Upgrade>();
  return (
    <span className="flex min-w-0 items-center gap-3">
      <img src={item.shop_image_webp ?? ""} alt="" className="size-8 shrink-0 object-contain" draggable={false} />
      <span className="truncate tracking-wide uppercase">{item.name}</span>
    </span>
  );
}

function ItemEffectsOption({ hiddenWords }: { hiddenWords: Map<number, string[]> }) {
  const item = useFlashcardEntry<Upgrade>();
  return (
    <ItemEffectCard item={item} className="w-full py-1 font-normal" hideName hiddenWords={hiddenWords.get(item.id)} />
  );
}

function ItemEffectFlashcards() {
  const { data: items, isLoading, isError, isFetching, refetch } = useQuery(itemUpgradesFullQueryOptions);
  const [direction, setDirection] = useState<Direction>("effects-to-name");
  const [excludeLegendary, setExcludeLegendary] = useState(false);

  const described = useMemo(
    () => (items ? filterShopableItems(items).filter((item) => (item.tooltip_sections?.length ?? 0) > 0) : []),
    [items],
  );
  // From every described item, not the pool: excluding legendaries must not change what a card hides.
  const hiddenWords = useMemo(() => giveawayNameWords(described), [described]);
  const pool = useMemo(
    () => (excludeLegendary ? described.filter((item) => item.item_tier !== LEGENDARY_TIER) : described),
    [described, excludeLegendary],
  );

  const effectsToName = direction === "effects-to-name";

  return (
    <FlashcardGame
      title="Item Effect Flashcards"
      // One line for both directions: a subtitle that changed with the switch moved the switch under the tap.
      subtitle="Match shop items to their stats and effects."
      pool={pool}
      reshuffleKey={`${direction}:${excludeLegendary}`}
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
    >
      <FlashcardPrompt size="wide">
        <ItemPrompt direction={direction} hiddenWords={hiddenWords} />
      </FlashcardPrompt>
      <FlashcardOptions>
        {effectsToName ? <ItemNameOption /> : <ItemEffectsOption hiddenWords={hiddenWords} />}
      </FlashcardOptions>
    </FlashcardGame>
  );
}
