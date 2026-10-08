import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";

import { FlashcardPage } from "~/components/features/flashcards/FlashcardChrome";
import {
  FlashcardBoard,
  FlashcardOptions,
  FlashcardPrompt,
  useFlashcardEntry,
} from "~/components/features/flashcards/FlashcardGame";
import { useFlashcardDeck } from "~/components/features/flashcards/use-flashcard-deck";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { Inline, Stack } from "~/components/ui/stack";
import { Text } from "~/components/ui/text";
import { useHydrated } from "~/hooks/useHydrated";
import { pageTitle, seo } from "~/lib/seo";
import { filterShopableItems, itemUpgradesQueryOptions, type SlimUpgrade } from "~/queries/asset-queries";

const OPTION_COUNT = 4;
const FEEDBACK_MS = { correct: 600, wrong: 1800 };

interface UpgradePathEntry {
  id: number;
  target: SlimUpgrade;
  components: SlimUpgrade[];
  answerKey: string;
  answerLabel: string;
}

interface UpgradePathOption {
  key: string;
  label: string;
  components: SlimUpgrade[];
}

interface UpgradePathCard {
  answer: UpgradePathEntry;
  options: UpgradePathOption[];
}

export const Route = createFileRoute("/games_/flashcards/item-upgrades")({
  component: ItemUpgradePathFlashcards,
  head: () => {
    const s = seo({
      title: pageTitle("Item Upgrade Flashcards - Learn Components"),
      description: "Study Deadlock item upgrade paths by matching upgraded items to their component items.",
      path: "/games/flashcards/item-upgrades",
    });
    return s;
  },
});

function itemImageSrc(item: SlimUpgrade): string {
  return item.shop_image_webp ?? item.image_webp ?? "";
}

function isUsableShopItem(item: SlimUpgrade): boolean {
  return item.shopable && !item.disabled && itemImageSrc(item).length > 0;
}

function buildAnswerKey(components: SlimUpgrade[]): string {
  return components.map((item) => item.id).join("+");
}

function buildAnswerLabel(components: SlimUpgrade[]): string {
  return components.map((item) => item.name).join(" + ");
}

function buildUpgradePathPool(items: SlimUpgrade[]): UpgradePathEntry[] {
  const itemByClassName = new Map(items.map((item) => [item.class_name, item]));

  return filterShopableItems(items)
    .flatMap((target): UpgradePathEntry[] => {
      const componentClassNames = target.component_items?.filter(Boolean) ?? [];
      if (componentClassNames.length === 0) return [];

      const components = componentClassNames
        .map((className) => itemByClassName.get(className))
        .filter((item): item is SlimUpgrade => item != null);

      if (components.length !== componentClassNames.length || !components.every(isUsableShopItem)) {
        return [];
      }

      return [
        {
          id: target.id,
          target,
          components,
          answerKey: buildAnswerKey(components),
          answerLabel: buildAnswerLabel(components),
        },
      ];
    })
    .sort((a, b) => a.target.item_tier - b.target.item_tier || a.target.name.localeCompare(b.target.name));
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function entryToOption(entry: UpgradePathEntry): UpgradePathOption {
  return {
    key: entry.answerKey,
    label: entry.answerLabel,
    components: entry.components,
  };
}

function componentSlotSignature(entry: UpgradePathEntry): string {
  return entry.components.map((component) => component.item_slot_type).join("+");
}

function totalComponentTier(entry: UpgradePathEntry): number {
  return entry.components.reduce((sum, component) => sum + component.item_tier, 0);
}

function totalComponentCost(entry: UpgradePathEntry): number {
  return entry.components.reduce((sum, component) => sum + (component.cost ?? 0), 0);
}

function distractorScore(answer: UpgradePathEntry, candidate: UpgradePathEntry): number {
  const targetSlotPenalty = answer.target.item_slot_type === candidate.target.item_slot_type ? 0 : 1_000;
  const componentCountPenalty = answer.components.length === candidate.components.length ? 0 : 250;
  const componentSlotPenalty = componentSlotSignature(answer) === componentSlotSignature(candidate) ? 0 : 120;
  const targetTierDistance = Math.abs(answer.target.item_tier - candidate.target.item_tier) * 30;
  const componentTierDistance = Math.abs(totalComponentTier(answer) - totalComponentTier(candidate)) * 12;
  const targetCostDistance = Math.abs((answer.target.cost ?? 0) - (candidate.target.cost ?? 0)) / 100;
  const componentCostDistance = Math.abs(totalComponentCost(answer) - totalComponentCost(candidate)) / 150;

  return (
    targetSlotPenalty +
    componentCountPenalty +
    componentSlotPenalty +
    targetTierDistance +
    componentTierDistance +
    targetCostDistance +
    componentCostDistance
  );
}

function rankedDistractors(
  answer: UpgradePathEntry,
  pool: UpgradePathEntry[],
  random: () => number,
): UpgradePathOption[] {
  const usedAnswerKeys = new Set<string>([answer.answerKey]);
  const distractors: UpgradePathOption[] = [];

  const addCandidates = (predicate: (entry: UpgradePathEntry) => boolean) => {
    const candidates = pool
      .filter((entry) => !usedAnswerKeys.has(entry.answerKey) && predicate(entry))
      .sort((a, b) => distractorScore(answer, a) - distractorScore(answer, b));

    for (const candidate of candidates) {
      if (distractors.length >= OPTION_COUNT - 1) return;
      // Several items can share one component path (Sprint Boots alone builds more than one); offer it once.
      if (usedAnswerKeys.has(candidate.answerKey)) continue;
      usedAnswerKeys.add(candidate.answerKey);
      distractors.push(entryToOption(candidate));
    }
  };

  const sameTargetSlot = (entry: UpgradePathEntry) => entry.target.item_slot_type === answer.target.item_slot_type;
  const sameComponentCount = (entry: UpgradePathEntry) => entry.components.length === answer.components.length;
  const sameComponentSlots = (entry: UpgradePathEntry) =>
    componentSlotSignature(entry) === componentSlotSignature(answer);

  addCandidates((entry) => sameTargetSlot(entry) && sameComponentCount(entry) && sameComponentSlots(entry));
  addCandidates((entry) => sameTargetSlot(entry) && sameComponentCount(entry));
  addCandidates((entry) => sameTargetSlot(entry));
  addCandidates((entry) => sameComponentCount(entry));
  addCandidates(() => true);

  return shuffle(distractors, random);
}

function pickCard(pool: UpgradePathEntry[], excludeIds: Set<number>, random: () => number): UpgradePathCard | null {
  const answerPool = pool.filter((entry) => !excludeIds.has(entry.id));
  if (answerPool.length === 0) return null;

  const answer = answerPool[Math.floor(random() * answerPool.length)];
  const answerOption = entryToOption(answer);
  const distractors = rankedDistractors(answer, pool, random);

  return {
    answer,
    options: shuffle([answerOption, ...distractors], random),
  };
}

function ItemUpgradePathFlashcards() {
  const { data: items, isLoading, isError, isFetching, refetch } = useQuery(itemUpgradesQueryOptions);
  // The first card is drawn at random, so the server and client would disagree on it.
  const hydrated = useHydrated();

  const pool = useMemo(() => {
    if (!items) return [];
    return buildUpgradePathPool(items);
  }, [items]);

  if (isLoading || !hydrated) {
    return (
      <FlashcardPage title={TITLE} subtitle={SUBTITLE}>
        <LoadingState label="flashcards" />
      </FlashcardPage>
    );
  }

  // A failed load would otherwise read as an empty deck.
  if (isError && !items) {
    return (
      <FlashcardPage title={TITLE} subtitle={SUBTITLE}>
        <ErrorState title="Could not load the cards" onRetry={() => void refetch()} retrying={isFetching} />
      </FlashcardPage>
    );
  }

  return <ItemUpgradePathFlashcardsReady pool={pool} />;
}

const TITLE = "Item Upgrade Paths";
const SUBTITLE = "Match each upgraded item to its direct component path.";

const optionKey = (option: UpgradePathOption) => option.key;
const optionName = (option: UpgradePathOption) => option.label;
const answerKey = (answer: UpgradePathEntry) => answer.answerKey;
const answerName = (answer: UpgradePathEntry) => answer.answerLabel;

function ItemUpgradePathFlashcardsReady({ pool }: { pool: UpgradePathEntry[] }) {
  const deck = useFlashcardDeck({
    pool,
    deck: "item-upgrades",
    draw: pickCard,
    optionKey,
    optionName,
    answerKey,
    answerName,
    feedbackMs: FEEDBACK_MS,
  });

  return (
    <FlashcardBoard
      deck={deck}
      title={TITLE}
      subtitle={SUBTITLE}
      total={pool.length}
      masteredLabel="All upgrade paths mastered"
      emptyTitle="No upgrade paths found."
    >
      <FlashcardPrompt size="wide" mark="inline">
        <UpgradedItem />
      </FlashcardPrompt>
      <FlashcardOptions size="lg">
        <ComponentPath />
      </FlashcardOptions>
    </FlashcardBoard>
  );
}

/** The prompt: the upgraded item, its slot, tier and cost. */
function UpgradedItem() {
  const { target } = useFlashcardEntry<UpgradePathEntry>();
  return (
    <>
      <img
        src={itemImageSrc(target)}
        alt={target.name}
        className="size-20 shrink-0 object-contain sm:size-24"
        draggable={false}
      />
      <Stack gap={1} className="flex-1">
        <div>
          <Text as="div" variant="eyebrow" className="font-mono">
            Upgraded item
          </Text>
          <div className="truncate text-lg font-semibold text-foreground">{target.name}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2 font-mono text-xs tracking-wider text-muted-foreground uppercase">
          <span>{target.item_slot_type}</span>
          <span className="text-muted-foreground">|</span>
          <span>Tier {target.item_tier}</span>
          {target.cost != null && (
            <>
              <span className="text-muted-foreground">|</span>
              <span>{target.cost.toLocaleString("en-US")} souls</span>
            </>
          )}
        </div>
      </Stack>
    </>
  );
}

/** An option: the component items and their names. */
function ComponentPath() {
  const option = useFlashcardEntry<UpgradePathOption>();
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Inline gap={1} wrap="nowrap" className="shrink-0">
        {option.components.map((item) => (
          <img key={item.id} src={itemImageSrc(item)} alt="" className="size-10 object-contain" draggable={false} />
        ))}
      </Inline>
      <span className="min-w-0 font-mono text-sm font-medium tracking-wide uppercase">{option.label}</span>
    </div>
  );
}
