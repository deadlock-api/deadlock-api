import newRockerWoff2 from "@fontsource/new-rocker/files/new-rocker-latin-400-normal.woff2?url";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import type { Upgrade } from "deadlock_api_client";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Check, RotateCcw, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { LoadingLogo } from "~/components/LoadingLogo";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Label } from "~/components/ui/label";
import { seo } from "~/lib/seo";
import { cn } from "~/lib/utils";
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

export const Route = createFileRoute("/flashcards/item-upgrades")({
  component: ItemUpgradePathFlashcards,
  head: () => {
    const s = seo({
      title: "Item Upgrade Path Flashcards - Learn Item Components | Deadlock API",
      description: "Study Deadlock item upgrade paths by matching upgraded items to their component items.",
      path: "/flashcards/item-upgrades",
    });
    return {
      ...s,
      links: [
        ...s.links,
        {
          rel: "preload",
          href: newRockerWoff2,
          as: "font",
          type: "font/woff2",
          crossOrigin: "anonymous",
        },
      ],
    };
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
  const { data: items, isLoading } = useQuery(itemUpgradesQueryOptions);

  const pool = useMemo(() => {
    if (!items) return [];
    return buildUpgradePathPool(items);
  }, [items]);

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <LoadingLogo className="h-16 w-16 animate-pulse" />
      </div>
    );
  }

  return <ItemUpgradePathFlashcardsReady pool={pool} />;
}

function ItemUpgradePathFlashcardsReady({ pool }: { pool: UpgradePathEntry[] }) {
  const [card, setCard] = useState<UpgradePathCard | null>(() => (pool.length > 0 ? pickCard(pool, new Set()) : null));
  const [selected, setSelected] = useState<string | null>(null);
  const [stats, setStats] = useState({ correct: 0, seen: 0, streak: 0, bestStreak: 0 });
  const [seenIds, setSeenIds] = useState<Set<number>>(new Set());
  const [noRepeats, setNoRepeats] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("flashcards:item-upgrades:no-repeats") === "true";
  });
  const advanceTimer = useRef<number | null>(null);
  const noRepeatsRef = useRef(noRepeats);

  const clearAdvanceTimer = useCallback(() => {
    if (advanceTimer.current !== null) {
      window.clearTimeout(advanceTimer.current);
      advanceTimer.current = null;
    }
  }, []);

  const resetGame = useCallback(() => {
    clearAdvanceTimer();
    setStats({ correct: 0, seen: 0, streak: 0, bestStreak: 0 });
    setSelected(null);
    setSeenIds(new Set());
    setCard(pool.length > 0 ? pickCard(pool, new Set()) : null);
  }, [clearAdvanceTimer, pool]);

  useEffect(() => {
    return () => clearAdvanceTimer();
  }, [clearAdvanceTimer]);

  const updateNoRepeats = useCallback((value: boolean) => {
    noRepeatsRef.current = value;
    setNoRepeats(value);
    if (typeof window !== "undefined") {
      localStorage.setItem("flashcards:item-upgrades:no-repeats", String(value));
    }
  }, []);

  const handleChoice = useCallback(
    (key: string) => {
      if (!card || selected !== null) return;

      setSelected(key);
      const correct = key === card.answer.answerKey;

      setStats((prev) => {
        const nextStreak = correct ? prev.streak + 1 : 0;
        return {
          correct: prev.correct + (correct ? 1 : 0),
          seen: prev.seen + 1,
          streak: nextStreak,
          bestStreak: Math.max(prev.bestStreak, nextStreak),
        };
      });

      const nextSeen = new Set(seenIds);
      if (correct) nextSeen.add(card.answer.id);

      advanceTimer.current = window.setTimeout(
        () => {
          setSelected(null);
          setSeenIds(nextSeen);
          const exclude = noRepeatsRef.current ? nextSeen : new Set<number>([card.answer.id]);
          setCard(pickCard(pool, exclude));
        },
        correct ? CORRECT_FEEDBACK_MS : WRONG_FEEDBACK_MS,
      );
    },
    [card, selected, seenIds, pool],
  );

  const accuracy = stats.seen > 0 ? Math.round((stats.correct / stats.seen) * 100) : 0;
  const empty = pool.length === 0;
  const exhausted = noRepeats && pool.length > 0 && seenIds.size >= pool.length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="mx-auto max-w-4xl px-4 py-8"
    >
      <div className="mb-6">
        <Link
          to="/flashcards"
          className="mb-4 inline-flex items-center gap-1.5 font-mono text-xs tracking-wider text-muted-foreground/50 uppercase transition-colors hover:text-primary"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to Hub
        </Link>
        <h1 className="bg-linear-to-b from-foreground to-foreground/50 bg-clip-text font-game text-2xl tracking-tight text-transparent uppercase">
          Item Upgrade Paths
        </h1>
        <p className="mt-1 font-mono text-sm text-muted-foreground/60">
          Match each upgraded item to its direct component path.
        </p>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-3 border border-border bg-card/40 px-4 py-3 font-mono text-xs tracking-wider uppercase">
        <Stat label="Correct" value={`${stats.correct}/${stats.seen}`} />
        <Divider />
        <Stat label="Accuracy" value={`${accuracy}%`} />
        <Divider />
        <Stat label="Streak" value={`${stats.streak}`} highlight={stats.streak >= 3} />
        <Divider />
        <Stat label="Best" value={`${stats.bestStreak}`} />
        <Button
          variant="ghost"
          size="sm"
          onClick={resetGame}
          disabled={stats.seen === 0}
          className="ml-auto h-7 gap-1.5 px-2 text-xs"
        >
          <RotateCcw className="size-3" />
          Reset
        </Button>
      </div>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 px-1 font-mono text-xs tracking-wider uppercase">
        <Label
          htmlFor="flashcard-upgrade-no-repeats"
          className="flex cursor-pointer items-center gap-2 text-muted-foreground/70 hover:text-foreground"
        >
          <Checkbox
            id="flashcard-upgrade-no-repeats"
            checked={noRepeats}
            onCheckedChange={(value) => updateNoRepeats(value === true)}
          />
          <span>No repeats</span>
          {noRepeats && (
            <span className="text-muted-foreground/40 normal-case">
              ({seenIds.size}/{pool.length} mastered)
            </span>
          )}
        </Label>
      </div>

      {empty ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="flex flex-col items-center gap-4 border border-border bg-card/40 px-6 py-12 text-center"
        >
          <p className="font-mono text-sm tracking-wider text-muted-foreground/70 uppercase">No upgrade paths found.</p>
        </motion.div>
      ) : exhausted || !card ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="flex flex-col items-center gap-4 border border-green-500/30 bg-green-500/5 px-6 py-12 text-center"
        >
          <div className="flex size-12 items-center justify-center rounded-full bg-green-500/15 text-green-400">
            <Check className="size-6" />
          </div>
          <div>
            <p className="font-game text-xl tracking-tight text-foreground uppercase">All upgrade paths mastered</p>
            <p className="mt-1 font-mono text-xs tracking-wider text-muted-foreground/60 uppercase">
              You got {stats.correct}/{stats.seen} correct ({accuracy}%)
            </p>
          </div>
          <Button onClick={resetGame} variant="outline" className="gap-2">
            <RotateCcw className="size-4" />
            Play again
          </Button>
        </motion.div>
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
            <div
              className={cn(
                "flex w-full max-w-xl items-center gap-4 border bg-muted/25 p-4 ring-1 transition-colors duration-200",
                selected === null
                  ? "border-border/80 ring-border/30"
                  : selected === card.answer.answerKey
                    ? "border-green-500/50 ring-green-500/30"
                    : "border-primary/50 ring-primary/30",
              )}
            >
              <img
                src={itemImageSrc(card.answer.target)}
                alt={card.answer.target.name}
                className="size-20 shrink-0 rounded-sm object-contain sm:size-24"
                draggable={false}
              />
              <div className="min-w-0 flex-1">
                <div className="font-mono text-[10px] tracking-wider text-muted-foreground/50 uppercase">
                  Upgraded item
                </div>
                <div className="truncate text-lg font-semibold text-foreground">{card.answer.target.name}</div>
                <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-xs tracking-wider text-muted-foreground/60 uppercase">
                  <span>{card.answer.target.item_slot_type}</span>
                  <span className="text-muted-foreground/25">|</span>
                  <span>Tier {card.answer.target.item_tier}</span>
                  {card.answer.target.cost != null && (
                    <>
                      <span className="text-muted-foreground/25">|</span>
                      <span>{card.answer.target.cost.toLocaleString()} souls</span>
                    </>
                  )}
                </div>
              </div>
              <AnimatePresence>
                {selected !== null && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.6 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.18, ease: "easeOut" }}
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-full border-2 shadow-lg",
                      selected === card.answer.answerKey
                        ? "border-green-400 bg-green-500 text-white"
                        : "border-primary/70 bg-primary text-primary-foreground",
                    )}
                  >
                    {selected === card.answer.answerKey ? <Check className="size-5" /> : <X className="size-5" />}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
              {card.options.map((option) => {
                const isAnswer = option.key === card.answer.answerKey;
                const isPicked = option.key === selected;
                const revealed = selected !== null;
                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => handleChoice(option.key)}
                    disabled={revealed}
                    className={cn(
                      "flex min-h-20 items-center justify-between gap-3 border px-3 py-3 text-left transition-colors duration-150",
                      !revealed &&
                        "border-border bg-card hover:border-primary/50 hover:bg-primary/5 hover:text-primary",
                      revealed && isAnswer && "border-green-500/60 bg-green-500/10 text-green-300",
                      revealed && !isAnswer && isPicked && "border-primary/60 bg-primary/10 text-primary",
                      revealed && !isAnswer && !isPicked && "border-border/50 bg-card/40 text-muted-foreground/60",
                    )}
                  >
                    <ComponentPath option={option} />
                    {revealed && isAnswer && <Check className="size-4 shrink-0 text-green-400" />}
                    {revealed && !isAnswer && isPicked && <X className="size-4 shrink-0 text-primary" />}
                  </button>
                );
              })}
            </div>
          </motion.div>
        </AnimatePresence>
      )}
    </motion.div>
  );
}

function ComponentPath({ option }: { option: UpgradePathOption }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="flex shrink-0 -space-x-1.5">
        {option.components.map((item) => (
          <img
            key={item.id}
            src={itemImageSrc(item)}
            alt=""
            className="size-10 rounded-sm border border-background bg-muted object-contain"
            draggable={false}
          />
        ))}
      </div>
      <span className="min-w-0 font-mono text-sm font-medium tracking-wide uppercase">{option.label}</span>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-muted-foreground/50">{label}</span>
      <span className={cn("font-semibold text-foreground", highlight && "text-primary")}>{value}</span>
    </div>
  );
}

function Divider() {
  return <span className="text-muted-foreground/20">|</span>;
}
