import { createFileRoute } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useMemo, type RefCallback } from "react";

import { AnswerOption, type AnswerOptionState, revealedState } from "~/components/domain/minigames/AnswerOption";
import { TerminalButton } from "~/components/domain/minigames/TerminalButton";
import { GameShell, GameShellError, GameShellLoading } from "~/components/features/deadlockdle/GameShell";
import { NextGameButton } from "~/components/features/deadlockdle/NextGameButton";
import { ScoreSummary } from "~/components/features/deadlockdle/ScoreSummary";
import { ShareButton } from "~/components/features/deadlockdle/ShareButton";
import { Card, CardContent } from "~/components/ui/card";
import { Field } from "~/components/ui/field";
import { Stack } from "~/components/ui/stack";
import { Text } from "~/components/ui/text";
import { useItems, puzzleLoadError } from "~/lib/deadlockdle/queries";
import {
  getDayNumber,
  getModeSeed,
  getTodayDate,
  puzzleShareUrl,
  resolvePuzzleDate,
  seededRandom,
  seededShuffle,
  validatePuzzleDateSearch,
} from "~/lib/deadlockdle/seed";
import { gameStorageKey, legacyGameStorageKey } from "~/lib/deadlockdle/storage";
import { useCountdown } from "~/lib/deadlockdle/use-countdown";
import { useStoredDailyState } from "~/lib/deadlockdle/use-stored-state";
import { seo } from "~/lib/seo";
import { filterShopableItems } from "~/queries/asset-queries";

export const Route = createFileRoute("/games_/deadlockdle/item-stats")({
  component: ItemStatsQuiz,
  validateSearch: validatePuzzleDateSearch,
  head: () =>
    seo({
      title: "Item Stats Quiz - Deadlockdle | Deadlock API",
      description: "How well do you know Deadlock items? Fill in the missing stats in this daily quiz.",
      path: "/games/deadlockdle/item-stats",
    }),
});

const ITEMS_COUNT = 5;
const FIELDS_PER_ITEM = 3;
const TOTAL_FIELDS = ITEMS_COUNT * FIELDS_PER_ITEM;

const SLOT_TYPES = ["weapon", "spirit", "vitality"] as const;
type SlotType = (typeof SLOT_TYPES)[number];

interface ItemAnswer {
  active?: boolean;
  tier?: number;
  slot?: string;
}

interface ItemStatsState {
  date: string;
  answers: Record<number, ItemAnswer>;
  submitted: boolean;
  score: number;
  totalFields: number;
}

const DEFAULT_STATE: ItemStatsState = {
  date: "",
  answers: {},
  submitted: false,
  score: 0,
  totalFields: TOTAL_FIELDS,
};

function freshState(date: string): ItemStatsState {
  return { ...DEFAULT_STATE, date };
}

function formatSlotLabel(slot: string): string {
  return slot.charAt(0).toUpperCase() + slot.slice(1);
}

const SLOT_TONE: Record<SlotType, React.ComponentProps<typeof AnswerOption>["tone"]> = {
  weapon: "item-weapon",
  spirit: "item-spirit",
  vitality: "item-vitality",
};

function tileState(isSelected: boolean, isAnswer: boolean, revealed: boolean): AnswerOptionState {
  if (revealed) return revealedState(isAnswer, isSelected);
  return isSelected ? "selected" : "idle";
}

function ItemStatsQuiz() {
  const itemsQuery = useItems();
  const { data: items, isLoading } = itemsQuery;
  const { date: dateParam } = Route.useSearch();
  const date = resolvePuzzleDate(dateParam);
  const isArchive = date !== getTodayDate();
  const storageKey = gameStorageKey("item-stats", date);
  const countdown = useCountdown();

  const [state, saveState] = useStoredDailyState(storageKey, date, freshState, legacyGameStorageKey("item-stats"));

  const shopableItems = useMemo(
    () =>
      items
        ? filterShopableItems(items).filter((item) => item.cost != null && item.item_tier >= 1 && item.item_tier <= 4)
        : [],
    [items],
  );

  const dailyItems = useMemo(() => {
    if (shopableItems.length === 0) return [];
    const seed = getModeSeed(date, "item-stats");
    const rng = seededRandom(seed);
    const shuffled = seededShuffle([...shopableItems], rng);
    return shuffled.slice(0, ITEMS_COUNT);
  }, [shopableItems, date]);

  const setAnswer = useCallback(
    (itemId: number, field: keyof ItemAnswer, value: number | string | boolean) => {
      if (state.submitted) return;
      saveState({
        ...state,
        answers: { ...state.answers, [itemId]: { ...state.answers[itemId], [field]: value } },
      });
    },
    [state, saveState],
  );

  const allFieldsFilled = useMemo(() => {
    if (dailyItems.length === 0) return false;
    return dailyItems.every((item) => {
      const answer = state.answers[item.id];
      return answer != null && answer.active != null && answer.tier != null && answer.slot != null;
    });
  }, [dailyItems, state.answers]);

  const fieldResults = useMemo(() => {
    if (!state.submitted || dailyItems.length === 0) return null;
    const results: Record<number, { active: boolean; tier: boolean; slot: boolean }> = {};
    for (const item of dailyItems) {
      const answer = state.answers[item.id];
      results[item.id] = {
        active: answer?.active === item.is_active_item,
        tier: answer?.tier === item.item_tier,
        slot: answer?.slot === item.item_slot_type,
      };
    }
    return results;
  }, [state.submitted, dailyItems, state.answers]);

  const handleSubmit = useCallback(() => {
    if (!allFieldsFilled || state.submitted) return;
    const score = dailyItems.reduce((total, item) => {
      const answer = state.answers[item.id];
      return (
        total +
        Number(answer?.active === item.is_active_item) +
        Number(answer?.tier === item.item_tier) +
        Number(answer?.slot === item.item_slot_type)
      );
    }, 0);

    saveState({ ...state, submitted: true, score, totalFields: TOTAL_FIELDS });
  }, [allFieldsFilled, state, dailyItems, saveState]);

  const scoreScrollRef = useCallback<RefCallback<HTMLDivElement>>((node) => {
    if (node) {
      setTimeout(() => node.scrollIntoView({ behavior: "smooth", block: "nearest" }), 150);
    }
  }, []);

  // A failed query leaves no puzzle to build, so without this the loader would spin forever.
  const loadError = puzzleLoadError(itemsQuery);
  if (loadError.isError) {
    return (
      <GameShellError
        title="Item Stats Quiz"
        subtitle="Fill in the missing stats for each item"
        date={date}
        onRetry={loadError.retry}
        retrying={loadError.retrying}
      />
    );
  }

  if (isLoading || dailyItems.length === 0) {
    return <GameShellLoading title="Item Stats Quiz" subtitle="Fill in the missing stats for each item" date={date} />;
  }

  return (
    <GameShell
      title="Item Stats Quiz"
      subtitle="Fill in the missing stats for each item"
      totalAttempts={0}
      usedAttempts={0}
      status={state.submitted ? "won" : "playing"}
      hideAttempts
      date={date}
    >
      <Stack gap={4}>
        {dailyItems.map((item, index) => {
          const answer = state.answers[item.id] ?? {};
          const result = fieldResults?.[item.id];
          const revealed = result != null;
          const imgSrc = item.shop_image_webp ?? item.shop_image ?? "";

          return (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.3,
                delay: index * 0.08,
                ease: "easeOut",
              }}
            >
              <Card size="sm">
                <CardContent className="flex flex-col gap-4">
                  <div className="flex items-center gap-3">
                    <Card tone="inset" size="flush" className="size-16 shrink-0 items-center justify-center">
                      <picture>
                        {item.shop_image_webp && <source srcSet={item.shop_image_webp} type="image/webp" />}
                        {item.shop_image && <source srcSet={item.shop_image} type="image/png" />}
                        <img src={imgSrc} alt={item.name} className="h-12 w-12 object-contain" draggable={false} />
                      </picture>
                    </Card>
                    <div>
                      <p className="text-sm font-bold tracking-tight">{item.name}</p>
                      <Text as="p" variant="eyebrow" className="font-mono">
                        Item {index + 1} of {ITEMS_COUNT}
                      </Text>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <Field label="Activation" className="font-mono">
                      <div className="flex gap-1.5">
                        {([true, false] as const).map((isActive) => {
                          const isSelected = answer.active === isActive;
                          return (
                            <AnswerOption
                              key={String(isActive)}
                              variant="tile"
                              state={tileState(isSelected, isActive === item.is_active_item, revealed)}
                              aria-pressed={isSelected}
                              onClick={() => setAnswer(item.id, "active", isActive)}
                              disabled={state.submitted}
                            >
                              {isActive ? "Active" : "Passive"}
                            </AnswerOption>
                          );
                        })}
                      </div>
                      {result && !result.active && (
                        <p className="text-3xs text-negative">Correct: {item.is_active_item ? "Active" : "Passive"}</p>
                      )}
                    </Field>

                    <Field label="Tier" className="font-mono">
                      <div className="flex gap-1.5">
                        {[1, 2, 3, 4].map((tier) => {
                          const isSelected = answer.tier === tier;
                          return (
                            <AnswerOption
                              key={tier}
                              variant="tile"
                              state={tileState(isSelected, tier === item.item_tier, revealed)}
                              aria-pressed={isSelected}
                              onClick={() => setAnswer(item.id, "tier", tier)}
                              disabled={state.submitted}
                            >
                              {tier}
                            </AnswerOption>
                          );
                        })}
                      </div>
                      {result && !result.tier && <p className="text-3xs text-negative">Correct: T{item.item_tier}</p>}
                    </Field>

                    <Field label="Slot" className="font-mono">
                      <div className="flex gap-1.5">
                        {SLOT_TYPES.map((slot) => {
                          const isSelected = answer.slot === slot;
                          return (
                            <AnswerOption
                              key={slot}
                              variant="tile"
                              state={tileState(isSelected, slot === item.item_slot_type, revealed)}
                              aria-pressed={isSelected}
                              onClick={() => setAnswer(item.id, "slot", slot)}
                              disabled={state.submitted}
                              tone={SLOT_TONE[slot]}
                            >
                              {formatSlotLabel(slot)}
                            </AnswerOption>
                          );
                        })}
                      </div>
                      {result && !result.slot && (
                        <p className="text-3xs text-negative">Correct: {formatSlotLabel(item.item_slot_type)}</p>
                      )}
                    </Field>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </Stack>

      {!state.submitted && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: ITEMS_COUNT * 0.08 + 0.2 }}
          className="flex justify-center"
        >
          <TerminalButton variant="soft" size="lg" onClick={handleSubmit} disabled={!allFieldsFilled}>
            Submit All
          </TerminalButton>
        </motion.div>
      )}

      <AnimatePresence>
        {state.submitted && (
          <motion.div
            ref={scoreScrollRef}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="flex flex-col gap-4"
          >
            <ScoreSummary
              score={`${state.score}/${state.totalFields}`}
              scoreLabel="Correct Answers"
              grade={state.score >= TOTAL_FIELDS * 0.8 ? "good" : state.score >= TOTAL_FIELDS * 0.5 ? "fair" : "poor"}
              countdown={isArchive ? undefined : { label: "Next Quiz", value: countdown }}
            />
            <div className="flex flex-col items-center gap-3">
              <ShareButton
                text={`Deadlockdle #${getDayNumber(state.date)} - Stats ${state.score}/${state.totalFields}\n${puzzleShareUrl(date)}`}
              >
                Share Result
              </ShareButton>
              <NextGameButton currentMode="item-stats" date={date} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </GameShell>
  );
}
