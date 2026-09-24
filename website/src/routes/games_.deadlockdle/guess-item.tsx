import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useMemo, useState } from "react";

import { SilhouetteFrame } from "~/components/domain/minigames/SilhouetteFrame";
import { GameShell, GameShellError, GameShellLoading } from "~/components/features/deadlockdle/GameShell";
import { GuessFeedback } from "~/components/features/deadlockdle/GuessFeedback";
import { GuessInput } from "~/components/features/deadlockdle/GuessInput";
import { HintReveal } from "~/components/features/deadlockdle/HintReveal";
import { PreviousGuesses } from "~/components/features/deadlockdle/PreviousGuesses";
import { ResultModal } from "~/components/features/deadlockdle/ResultModal";
import { Stack } from "~/components/ui/stack";
import { useItems, puzzleLoadError } from "~/lib/deadlockdle/queries";
import { getModeSeed, seededPick, seededRandom, validatePuzzleDateSearch } from "~/lib/deadlockdle/seed";
import { useDailyGame } from "~/lib/deadlockdle/use-daily-game";
import { pageTitle, seo } from "~/lib/seo";
import { filterShopableItems } from "~/queries/asset-queries";

export const Route = createFileRoute("/games_/deadlockdle/guess-item")({
  component: GuessItem,
  validateSearch: validatePuzzleDateSearch,
  head: () =>
    seo({
      title: pageTitle("Guess the Item - Deadlockdle"),
      description: "Can you identify the Deadlock item from a blurred image? Daily puzzle with progressive hints.",
      path: "/games/deadlockdle/guess-item",
    }),
});

const MAX_ATTEMPTS = 5;

const BLUR_STEPS = [20, 14, 8, 3, 0];

function getBlurFilter(hintsRevealed: number, isFinished: boolean): string {
  if (isFinished) return "none";
  const blur = BLUR_STEPS[Math.min(hintsRevealed, BLUR_STEPS.length - 1)];
  return `blur(${blur}px)`;
}

function formatSlotType(slot: string): string {
  return slot.charAt(0).toUpperCase() + slot.slice(1);
}

function getPropertyHint(
  properties: Record<string, { value?: unknown; label?: string | null; postfix?: string | null }> | null | undefined,
): string {
  if (!properties) return "No properties available";

  // The unit ("s", "m", "%") comes separately; without it "Cooldown: 23" reads as a bare number.
  const withUnit = (prop: { value?: unknown; postfix?: string | null }) => {
    const value = String(prop.value);
    const postfix = (prop.postfix ?? "").trim();
    return value.endsWith(postfix) ? value : value + postfix;
  };

  for (const [, prop] of Object.entries(properties)) {
    if (prop.label && prop.value != null && typeof prop.value === "number") {
      return `${prop.label}: ${withUnit(prop)}`;
    }
  }

  for (const [, prop] of Object.entries(properties)) {
    if (prop.label && prop.value != null) {
      return `${prop.label}: ${withUnit(prop)}`;
    }
  }

  return "No properties available";
}

function GuessItem() {
  const itemsQuery = useItems();
  const { data: items, isLoading } = itemsQuery;
  const { date: dateParam } = Route.useSearch();
  const { gameState, streakState, isFinished, submitGuess, date, isArchive } = useDailyGame(
    "guess-item",
    MAX_ATTEMPTS,
    dateParam,
  );

  const [shakeKey, setShakeKey] = useState(0);
  const [feedbackType, setFeedbackType] = useState<"correct" | "wrong" | null>(null);

  const shopableItems = useMemo(() => (items ? filterShopableItems(items) : []), [items]);

  const dailyItem = useMemo(() => {
    if (shopableItems.length === 0) return null;
    const seed = getModeSeed(date, "guess-item");
    const rng = seededRandom(seed);
    return seededPick(shopableItems, rng);
  }, [shopableItems, date]);

  const hints = useMemo(() => {
    if (!dailyItem) return [];

    const slot = formatSlotType(dailyItem.item_slot_type);
    const activation = dailyItem.is_active_item ? "Active" : "Passive";

    const propertyHint = getPropertyHint(
      dailyItem.properties as Record<
        string,
        { value?: unknown; label?: string | null; postfix?: string | null }
      > | null,
    );

    return [
      { label: "SLOT", value: slot },
      { label: "ACTIVATION", value: activation },
      { label: "PROPERTY", value: propertyHint },
      { label: "TIER", value: `Tier ${dailyItem.item_tier}` },
    ];
  }, [dailyItem]);

  const guessOptions = useMemo(() => {
    const guessedSet = new Set(gameState.guesses.map((g) => g.toLowerCase()));
    return shopableItems
      .filter((item) => !guessedSet.has(item.name.toLowerCase()))
      .map((item) => ({ id: item.id, name: item.name }));
  }, [shopableItems, gameState.guesses]);

  function handleGuess(_id: string | number, name: string) {
    if (!dailyItem || isFinished) return;
    const correct = name.toLowerCase() === dailyItem.name.toLowerCase();
    submitGuess(name, correct);
    setFeedbackType(correct ? "correct" : "wrong");
    setTimeout(() => setFeedbackType(null), 900);
    if (!correct) {
      setShakeKey((k) => k + 1);
    }
  }

  // A failed query leaves no puzzle to build, so without this the loader would spin forever.
  const loadError = puzzleLoadError(itemsQuery);
  if (loadError.isError) {
    return (
      <GameShellError
        title="Guess the Item"
        subtitle="Identify the item from its blurred shop image"
        date={date}
        onRetry={loadError.retry}
        retrying={loadError.retrying}
      />
    );
  }

  if (isLoading || !dailyItem) {
    return (
      <GameShellLoading title="Guess the Item" subtitle="Identify the item from its blurred shop image" date={date} />
    );
  }

  const itemImgSrc = dailyItem.shop_image_webp ?? dailyItem.shop_image ?? "";

  return (
    <GameShell
      title="Guess the Item"
      subtitle="Identify the item from its blurred shop image"
      totalAttempts={MAX_ATTEMPTS}
      usedAttempts={gameState.guesses.length}
      status={gameState.status}
      date={date}
    >
      <GuessFeedback type={feedbackType} triggerKey={shakeKey} />

      <motion.div
        key={shakeKey}
        animate={shakeKey > 0 ? { x: [-8, 8, -4, 4, 0] } : undefined}
        transition={{ duration: 0.35, ease: "easeInOut" }}
        className="flex justify-center"
      >
        <Stack gap={2}>
          {/* The art keeps its own colors: this round hides the item behind blur, not behind a silhouette. */}
          <SilhouetteFrame
            state={isFinished ? "revealed" : "hidden"}
            reveal={1}
            label={isFinished ? dailyItem.name : "Mystery item"}
          >
            <picture>
              {dailyItem.shop_image_webp && <source srcSet={dailyItem.shop_image_webp} type="image/webp" />}
              {dailyItem.shop_image && <source srcSet={dailyItem.shop_image} type="image/png" />}
              <img
                src={itemImgSrc}
                alt="Mystery item"
                className="h-28 w-28 object-contain sm:h-40 sm:w-40"
                style={{
                  filter: getBlurFilter(gameState.hintsRevealed, isFinished),
                }}
                draggable={false}
              />
            </picture>
          </SilhouetteFrame>
          {isFinished && (
            <motion.p
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center font-mono text-sm font-semibold text-foreground"
            >
              {dailyItem.name}
            </motion.p>
          )}
        </Stack>
      </motion.div>

      {hints.length > 0 && <HintReveal hints={hints} revealedCount={gameState.hintsRevealed} />}

      <div className="flex justify-center">
        <GuessInput
          options={guessOptions}
          onSubmit={handleGuess}
          disabled={isFinished}
          placeholder="GUESS THE ITEM..."
        />
      </div>

      <PreviousGuesses guesses={gameState.guesses} answer={dailyItem.name} />

      <ResultModal
        open={isFinished}
        status={gameState.status}
        answer={dailyItem.name}
        mode="guess-item"
        date={date}
        guesses={gameState.guesses}
        maxAttempts={MAX_ATTEMPTS}
        streakState={streakState}
        isArchive={isArchive}
      />
    </GameShell>
  );
}
