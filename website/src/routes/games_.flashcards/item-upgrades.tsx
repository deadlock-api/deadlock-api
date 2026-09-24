import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { Upgrade } from "deadlock_api_client";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AnswerOption, revealedState } from "~/components/domain/minigames/AnswerOption";
import {
  AnswerAnnouncement,
  FlashcardMastered,
  FlashcardPage,
  FlashcardStatStrip,
  NoRepeatsToggle,
  PromptFrame,
  ResultMark,
} from "~/components/features/flashcards/FlashcardChrome";
import { useAnswerKeys } from "~/components/features/flashcards/use-answer-keys";
import { useFlashcardProgress } from "~/components/features/flashcards/use-flashcard-progress";
import { useNextCardFocus } from "~/components/features/flashcards/use-next-card-focus";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { Inline, Stack } from "~/components/ui/stack";
import { Text } from "~/components/ui/text";
import { useHydrated } from "~/hooks/useHydrated";
import { pageTitle, seo } from "~/lib/seo";
import { filterShopableItems, itemUpgradesQueryOptions } from "~/queries/asset-queries";

const OPTION_COUNT = 4;
const CORRECT_FEEDBACK_MS = 600;
const WRONG_FEEDBACK_MS = 1800;

interface UpgradePathEntry {
  id: number;
  target: Upgrade;
  components: Upgrade[];
  answerKey: string;
  answerLabel: string;
}

interface UpgradePathOption {
  key: string;
  label: string;
  components: Upgrade[];
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

function itemImageSrc(item: Upgrade): string {
  return item.shop_image_webp ?? item.shop_image ?? item.image_webp ?? item.image ?? "";
}

function isUsableShopItem(item: Upgrade): boolean {
  return item.shopable && !item.disabled && itemImageSrc(item).length > 0;
}

function buildAnswerKey(components: Upgrade[]): string {
  return components.map((item) => item.id).join("+");
}

function buildAnswerLabel(components: Upgrade[]): string {
  return components.map((item) => item.name).join(" + ");
}

function buildUpgradePathPool(items: Upgrade[]): UpgradePathEntry[] {
  const itemByClassName = new Map(items.map((item) => [item.class_name, item]));

  return filterShopableItems(items)
    .flatMap((target): UpgradePathEntry[] => {
      const componentClassNames = target.component_items?.filter(Boolean) ?? [];
      if (componentClassNames.length === 0) return [];

      const components = componentClassNames
        .map((className) => itemByClassName.get(className))
        .filter((item): item is Upgrade => item != null);

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

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
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

function rankedDistractors(answer: UpgradePathEntry, pool: UpgradePathEntry[]): UpgradePathOption[] {
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

  return shuffle(distractors);
}

function pickCard(pool: UpgradePathEntry[], excludeIds: Set<number>): UpgradePathCard | null {
  const answerPool = pool.filter((entry) => !excludeIds.has(entry.id));
  if (answerPool.length === 0) return null;

  const answer = answerPool[Math.floor(Math.random() * answerPool.length)];
  const answerOption = entryToOption(answer);
  const distractors = rankedDistractors(answer, pool);

  return {
    answer,
    options: shuffle([answerOption, ...distractors]),
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

function ItemUpgradePathFlashcardsReady({ pool }: { pool: UpgradePathEntry[] }) {
  const { noRepeats, setNoRepeats, stats, seenIds, recordAnswer, resetProgress, loaded } =
    useFlashcardProgress("item-upgrades");
  const [card, setCard] = useState<UpgradePathCard | null>(null);
  const [dealt, setDealt] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const advanceTimer = useRef<number | null>(null);
  const { markAnswered, focusFirstOption } = useNextCardFocus();

  // The first card waits for the saved progress, so "No repeats" never opens on a card already mastered.
  if (loaded && !dealt) {
    setDealt(true);
    setCard(pickCard(pool, noRepeats ? seenIds : new Set()));
  }

  const clearAdvanceTimer = useCallback(() => {
    if (advanceTimer.current !== null) {
      window.clearTimeout(advanceTimer.current);
      advanceTimer.current = null;
    }
  }, []);

  const resetGame = useCallback(() => {
    clearAdvanceTimer();
    resetProgress();
    setSelected(null);
    setCard(pickCard(pool, new Set()));
  }, [clearAdvanceTimer, resetProgress, pool]);

  useEffect(() => {
    return () => clearAdvanceTimer();
  }, [clearAdvanceTimer]);

  const updateNoRepeats = useCallback(
    (value: boolean) => {
      setNoRepeats(value);
      // Allowing repeats again after the pool was mastered: deal a card rather than stay on "mastered".
      if (!value && card === null && pool.length > 0) setCard(pickCard(pool, new Set()));
    },
    [setNoRepeats, card, pool],
  );

  const handleChoice = useCallback(
    (key: string) => {
      if (!card || selected !== null) return;

      setSelected(key);
      markAnswered();
      const correct = key === card.answer.answerKey;

      const nextSeen = recordAnswer(card.answer.id, correct);

      advanceTimer.current = window.setTimeout(
        () => {
          setSelected(null);
          const exclude = noRepeats ? nextSeen : new Set<number>([card.answer.id]);
          setCard(pickCard(pool, exclude));
        },
        correct ? CORRECT_FEEDBACK_MS : WRONG_FEEDBACK_MS,
      );
    },
    [card, selected, noRepeats, recordAnswer, pool, markAnswered],
  );

  const pickByKey = useCallback(
    (index: number) => {
      const option = card?.options[index];
      if (option) handleChoice(option.key);
    },
    [card, handleChoice],
  );
  useAnswerKeys(card?.options.length ?? 0, pickByKey, selected === null);

  const empty = pool.length === 0;
  // A patch can drop paths already mastered; only the ones still in the deck count.
  const masteredInPool = pool.reduce((count, entry) => count + Number(seenIds.has(entry.id)), 0);
  // The last card keeps its verdict on screen before "mastered" replaces it.
  const exhausted = noRepeats && pool.length > 0 && masteredInPool >= pool.length && selected === null;
  const verdict = card === null || selected === null ? null : selected === card.answer.answerKey ? "correct" : "wrong";

  return (
    <FlashcardPage title={TITLE} subtitle={SUBTITLE}>
      <FlashcardStatStrip stats={stats} onReset={resetGame} />
      <AnswerAnnouncement verdict={verdict} answer={card?.answer.answerLabel ?? ""} />

      <div className="flex flex-wrap items-center justify-between gap-3 font-mono text-xs tracking-wider uppercase">
        <NoRepeatsToggle
          id="flashcard-upgrade-no-repeats"
          checked={noRepeats}
          onCheckedChange={updateNoRepeats}
          mastered={masteredInPool}
          total={pool.length}
        />
      </div>

      {!dealt ? (
        <LoadingState label="flashcards" />
      ) : empty ? (
        <EmptyState title="No upgrade paths found." />
      ) : exhausted || !card ? (
        <FlashcardMastered label="All upgrade paths mastered" stats={stats} onReset={resetGame} />
      ) : (
        <AnimatePresence mode="wait">
          <motion.div
            key={card.answer.id}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.02 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="flex flex-col items-center gap-6"
          >
            <PromptFrame verdict={verdict} className="w-full max-w-xl flex-row items-center gap-4 p-4">
              <img
                src={itemImageSrc(card.answer.target)}
                alt={card.answer.target.name}
                className="size-20 shrink-0 object-contain sm:size-24"
                draggable={false}
              />
              <Stack gap={1} className="flex-1">
                <div>
                  <Text as="div" variant="eyebrow" className="font-mono">
                    Upgraded item
                  </Text>
                  <div className="truncate text-lg font-semibold text-foreground">{card.answer.target.name}</div>
                </div>
                <div className="flex flex-wrap items-center gap-2 font-mono text-xs tracking-wider text-muted-foreground uppercase">
                  <span>{card.answer.target.item_slot_type}</span>
                  <span className="text-muted-foreground">|</span>
                  <span>Tier {card.answer.target.item_tier}</span>
                  {card.answer.target.cost != null && (
                    <>
                      <span className="text-muted-foreground">|</span>
                      <span>{card.answer.target.cost.toLocaleString("en-US")} souls</span>
                    </>
                  )}
                </div>
              </Stack>
              <AnimatePresence>
                {selected !== null && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.6 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.18, ease: "easeOut" }}
                  >
                    <ResultMark correct={verdict === "correct"} />
                  </motion.div>
                )}
              </AnimatePresence>
            </PromptFrame>

            <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
              {card.options.map((option, index) => (
                <AnswerOption
                  key={option.key}
                  ref={index === 0 ? focusFirstOption : undefined}
                  state={
                    selected === null
                      ? "idle"
                      : revealedState(option.key === card.answer.answerKey, option.key === selected)
                  }
                  onClick={() => handleChoice(option.key)}
                  shortcut={String(index + 1)}
                  aria-disabled={selected !== null || undefined}
                  className="min-h-20 px-3"
                >
                  <ComponentPath option={option} />
                </AnswerOption>
              ))}
            </div>
          </motion.div>
        </AnimatePresence>
      )}
    </FlashcardPage>
  );
}

function ComponentPath({ option }: { option: UpgradePathOption }) {
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
