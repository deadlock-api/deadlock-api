import { AnimatePresence, motion } from "framer-motion";
import { Check, Copy } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import type { MetaFunction } from "react-router";

import { LoadingLogo } from "~/components/LoadingLogo";
import { Button } from "~/components/ui/button";
import { createPageMeta } from "~/lib/meta";
import { cn } from "~/lib/utils";

import { GameShell } from "./deadlockdle/components/GameShell";
import { filterShopableItems, useItems } from "./deadlockdle/lib/queries";
import { getDayNumber, getModeSeed, getTodayDate, seededRandom, seededShuffle } from "./deadlockdle/lib/seed";
import { useCountdown } from "./deadlockdle/lib/use-countdown";

export const meta: MetaFunction = () => {
  return createPageMeta({
    title: "Item Stats Quiz - Deadlockdle | Deadlock API",
    description: "How well do you know Deadlock items? Fill in the missing stats in this daily quiz.",
    path: "/deadlockdle/item-stats",
  });
};

const ITEMS_COUNT = 5;
const FIELDS_PER_ITEM = 3;
const TOTAL_FIELDS = ITEMS_COUNT * FIELDS_PER_ITEM;
const STORAGE_KEY = "deadlockdle:item-stats:game";

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

function loadState(): ItemStatsState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    return JSON.parse(raw) as ItemStatsState;
  } catch {
    return DEFAULT_STATE;
  }
}

function saveState(state: ItemStatsState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function formatSlotLabel(slot: string): string {
  return slot.charAt(0).toUpperCase() + slot.slice(1);
}

/** Slot type color coding */
function getSlotColor(slot: SlotType): {
  bg: string;
  border: string;
  text: string;
} {
  switch (slot) {
    case "weapon":
      return {
        bg: "bg-amber-500/15",
        border: "border-amber-500/40",
        text: "text-amber-400",
      };
    case "spirit":
      return {
        bg: "bg-purple-500/15",
        border: "border-purple-500/40",
        text: "text-purple-400",
      };
    case "vitality":
      return {
        bg: "bg-green-500/15",
        border: "border-green-500/40",
        text: "text-green-400",
      };
  }
}

export default function ItemStatsQuiz() {
  const { data: items, isLoading } = useItems();
  const today = getTodayDate();
  const countdown = useCountdown();

  const [copied, setCopied] = useState(false);

  const [state, setState] = useState<ItemStatsState>(() => {
    const saved = loadState();
    if (saved.date !== today) {
      const fresh = { ...DEFAULT_STATE, date: today };
      saveState(fresh);
      return fresh;
    }
    return saved;
  });

  const shopableItems = useMemo(
    () =>
      items
        ? filterShopableItems(items).filter((item) => item.cost != null && item.item_tier >= 1 && item.item_tier <= 4)
        : [],
    [items],
  );

  const dailyItems = useMemo(() => {
    if (shopableItems.length === 0) return [];
    const seed = getModeSeed(today, "item-stats");
    const rng = seededRandom(seed);
    const shuffled = seededShuffle([...shopableItems], rng);
    return shuffled.slice(0, ITEMS_COUNT);
  }, [shopableItems, today]);

  const setAnswer = useCallback(
    (itemId: number, field: keyof ItemAnswer, value: number | string | boolean) => {
      if (state.submitted) return;
      setState((prev) => {
        const next: ItemStatsState = {
          ...prev,
          answers: {
            ...prev.answers,
            [itemId]: {
              ...prev.answers[itemId],
              [field]: value,
            },
          },
        };
        saveState(next);
        return next;
      });
    },
    [state.submitted],
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
    let score = 0;
    for (const item of dailyItems) {
      const answer = state.answers[item.id];
      if (answer?.active === item.is_active_item) score++;
      if (answer?.tier === item.item_tier) score++;
      if (answer?.slot === item.item_slot_type) score++;
    }
    setState((prev) => {
      const next: ItemStatsState = {
        ...prev,
        submitted: true,
        score,
        totalFields: TOTAL_FIELDS,
      };
      saveState(next);
      return next;
    });
  }, [allFieldsFilled, state.submitted, state.answers, dailyItems]);

  if (isLoading || dailyItems.length === 0) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <LoadingLogo className="h-16 w-16 animate-pulse" />
      </div>
    );
  }

  return (
    <GameShell
      title="Item Stats Quiz"
      subtitle="Fill in the missing stats for each item"
      totalAttempts={0}
      usedAttempts={0}
      status={state.submitted ? "won" : "playing"}
      hideAttempts
    >
      {/* Score header after submission */}
      <AnimatePresence>
        {state.submitted && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
            className="border border-muted-foreground/20 bg-[#0d1117]/80 py-4 text-center backdrop-blur-sm"
          >
            <p
              className={cn(
                "font-mono text-3xl font-bold tracking-wider",
                state.score >= TOTAL_FIELDS * 0.8
                  ? "text-green-400"
                  : state.score >= TOTAL_FIELDS * 0.5
                    ? "text-amber-400"
                    : "text-primary",
              )}
            >
              {state.score}/{state.totalFields}
            </p>
            <p className="mt-1 text-[10px] tracking-wider text-muted-foreground/50 uppercase">Correct Answers</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Item cards */}
      <div className="space-y-4">
        {dailyItems.map((item, index) => {
          const answer = state.answers[item.id] ?? {};
          const result = fieldResults?.[item.id];
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
              className="border border-muted-foreground/20 bg-[#0d1117]/60 p-4 backdrop-blur-sm"
            >
              {/* Item header: image + name */}
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center border border-muted-foreground/10 bg-black/30">
                  <picture>
                    {item.shop_image_webp && <source srcSet={item.shop_image_webp} type="image/webp" />}
                    {item.shop_image && <source srcSet={item.shop_image} type="image/png" />}
                    <img src={imgSrc} alt={item.name} className="h-12 w-12 object-contain" draggable={false} />
                  </picture>
                </div>
                <div>
                  <p className="text-sm font-bold tracking-tight">{item.name}</p>
                  <p className="font-mono text-[10px] tracking-wider text-muted-foreground/40 uppercase">
                    Item {index + 1} of {ITEMS_COUNT}
                  </p>
                </div>
              </div>

              {/* Fields */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {/* Active/Passive selector */}
                <div className="space-y-1.5">
                  <p className="font-mono text-[10px] tracking-wider text-muted-foreground/50 uppercase">Activation</p>
                  <div className="flex gap-1">
                    {([true, false] as const).map((isActive) => {
                      const label = isActive ? "Active" : "Passive";
                      const isSelected = answer.active === isActive;
                      const isCorrect = result && isActive === item.is_active_item;
                      const isWrongSelection = result && isSelected && !result.active;

                      return (
                        <motion.button
                          key={label}
                          type="button"
                          whileTap={!state.submitted ? { scale: 0.93, transition: { duration: 0 } } : undefined}
                          transition={{ type: "spring", stiffness: 400, damping: 17 }}
                          onClick={() => setAnswer(item.id, "active", isActive)}
                          disabled={state.submitted}
                          className={cn(
                            "flex-1 border py-2 font-mono text-[11px] font-semibold transition-colors",
                            "disabled:cursor-default",
                            result
                              ? isCorrect
                                ? "border-green-500/60 bg-green-500/15 text-green-400"
                                : isWrongSelection
                                  ? "border-red-500/60 bg-red-500/15 text-red-400"
                                  : "border-muted-foreground/10 bg-transparent text-muted-foreground/30"
                              : isSelected
                                ? "border-primary/60 bg-primary/15 text-primary"
                                : "border-muted-foreground/20 bg-black/30 text-muted-foreground/50 hover:border-muted-foreground/40",
                          )}
                        >
                          {label}
                        </motion.button>
                      );
                    })}
                  </div>
                  {result && !result.active && (
                    <p className="font-mono text-[10px] text-red-400/80">
                      Correct: {item.is_active_item ? "Active" : "Passive"}
                    </p>
                  )}
                </div>

                {/* Tier selector */}
                <div className="space-y-1.5">
                  <p className="font-mono text-[10px] tracking-wider text-muted-foreground/50 uppercase">Tier</p>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4].map((tier) => {
                      const isSelected = answer.tier === tier;
                      const isCorrect = result && tier === item.item_tier;
                      const isWrongSelection = result && isSelected && !result.tier;

                      return (
                        <motion.button
                          key={tier}
                          type="button"
                          whileTap={!state.submitted ? { scale: 0.93, transition: { duration: 0 } } : undefined}
                          transition={{ type: "spring", stiffness: 400, damping: 17 }}
                          onClick={() => setAnswer(item.id, "tier", tier)}
                          disabled={state.submitted}
                          className={cn(
                            "flex-1 border py-2 font-mono text-sm font-bold transition-colors",
                            "disabled:cursor-default",
                            result
                              ? isCorrect
                                ? "border-green-500/60 bg-green-500/15 text-green-400"
                                : isWrongSelection
                                  ? "border-red-500/60 bg-red-500/15 text-red-400"
                                  : "border-muted-foreground/10 bg-transparent text-muted-foreground/30"
                              : isSelected
                                ? "border-primary/60 bg-primary/15 text-primary"
                                : "border-muted-foreground/20 bg-black/30 text-muted-foreground/50 hover:border-muted-foreground/40",
                          )}
                        >
                          {tier}
                        </motion.button>
                      );
                    })}
                  </div>
                  {result && !result.tier && (
                    <p className="font-mono text-[10px] text-red-400/80">Correct: T{item.item_tier}</p>
                  )}
                </div>

                {/* Slot type selector */}
                <div className="space-y-1.5">
                  <p className="font-mono text-[10px] tracking-wider text-muted-foreground/50 uppercase">Slot</p>
                  <div className="flex gap-1">
                    {SLOT_TYPES.map((slot) => {
                      const isSelected = answer.slot === slot;
                      const isCorrect = result && slot === item.item_slot_type;
                      const isWrongSelection = result && isSelected && !result.slot;
                      const colors = getSlotColor(slot);

                      return (
                        <motion.button
                          key={slot}
                          type="button"
                          whileTap={!state.submitted ? { scale: 0.93, transition: { duration: 0 } } : undefined}
                          transition={{ type: "spring", stiffness: 400, damping: 17 }}
                          onClick={() => setAnswer(item.id, "slot", slot)}
                          disabled={state.submitted}
                          className={cn(
                            "flex-1 border py-2 font-mono text-[11px] font-semibold transition-colors",
                            "disabled:cursor-default",
                            result
                              ? isCorrect
                                ? `border-green-500/60 bg-green-500/15 text-green-400`
                                : isWrongSelection
                                  ? "border-red-500/60 bg-red-500/15 text-red-400"
                                  : "border-muted-foreground/10 bg-transparent text-muted-foreground/30"
                              : isSelected
                                ? `${colors.border} ${colors.bg} ${colors.text}`
                                : "border-muted-foreground/20 bg-black/30 text-muted-foreground/50 hover:border-muted-foreground/40",
                          )}
                        >
                          {formatSlotLabel(slot)}
                        </motion.button>
                      );
                    })}
                  </div>
                  {result && !result.slot && (
                    <p className="font-mono text-[10px] text-red-400/80">
                      Correct: {formatSlotLabel(item.item_slot_type)}
                    </p>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Submit button */}
      {!state.submitted && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: ITEMS_COUNT * 0.08 + 0.2 }}
          className="flex justify-center"
        >
          <motion.button
            type="button"
            whileTap={allFieldsFilled ? { scale: 0.95, transition: { duration: 0 } } : undefined}
            transition={{ type: "spring", stiffness: 400, damping: 17 }}
            onClick={handleSubmit}
            disabled={!allFieldsFilled}
            className={cn(
              "border px-8 py-3 font-mono text-sm font-bold tracking-wider uppercase transition-colors",
              allFieldsFilled
                ? "border-primary/60 bg-primary/15 text-primary hover:bg-primary/25 hover:shadow-[0_0_12px_rgba(250,68,84,0.2)]"
                : "cursor-not-allowed border-muted-foreground/20 bg-black/30 text-muted-foreground/30",
            )}
          >
            Submit All
          </motion.button>
        </motion.div>
      )}

      {/* Post-submission: countdown + share */}
      <AnimatePresence>
        {state.submitted && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="space-y-4"
          >
            <div className="border border-muted-foreground/10 py-4 text-center">
              <p className="mb-1 text-[10px] tracking-wider text-muted-foreground/40 uppercase">Next Quiz</p>
              <p className="font-mono text-lg font-bold tracking-widest">{countdown}</p>
            </div>
            <div className="flex justify-center">
              <Button
                onClick={async () => {
                  const text = `Deadlockdle #${getDayNumber(state.date)} - Stats ${state.score}/${state.totalFields}\nhttps://deadlock-api.com/deadlockdle`;
                  await navigator.clipboard.writeText(text);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                variant="outline"
                className="border-primary/40 font-mono text-xs tracking-wider uppercase hover:border-primary/60 hover:bg-primary/10"
              >
                {copied ? (
                  <>
                    <Check className="mr-1.5 h-3.5 w-3.5" /> Copied
                  </>
                ) : (
                  <>
                    <Copy className="mr-1.5 h-3.5 w-3.5" /> Share Result
                  </>
                )}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </GameShell>
  );
}
