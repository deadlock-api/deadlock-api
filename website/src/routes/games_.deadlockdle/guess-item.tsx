import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useMemo } from "react";

import { SilhouetteFrame } from "~/components/domain/minigames/SilhouetteFrame";
import { GameShell, GameShellError, GameShellLoading } from "~/components/features/deadlockdle/GameShell";
import { GuessFeedback } from "~/components/features/deadlockdle/GuessFeedback";
import { GuessInput } from "~/components/features/deadlockdle/GuessInput";
import { HintReveal } from "~/components/features/deadlockdle/HintReveal";
import { PreviousGuesses } from "~/components/features/deadlockdle/PreviousGuesses";
import { ResultModal } from "~/components/features/deadlockdle/ResultModal";
import { useDailyGuess } from "~/components/features/deadlockdle/use-daily-guess";
import { Stack } from "~/components/ui/stack";
import { itemHints } from "~/lib/deadlockdle/hints";
import { useItems, puzzleLoadError } from "~/lib/deadlockdle/queries";
import { validatePuzzleDateSearch } from "~/lib/deadlockdle/seed";
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

function GuessItem() {
  const itemsQuery = useItems();
  const { data: items, isLoading } = itemsQuery;
  const { date: dateParam } = Route.useSearch();
  const shopableItems = useMemo(() => (items ? filterShopableItems(items) : []), [items]);
  const {
    gameState,
    streakState,
    isFinished,
    date,
    isArchive,
    answer: dailyItem,
    hints,
    guessOptions,
    guess,
    shakeKey,
    feedbackType,
    feedbackMessage,
  } = useDailyGuess({
    mode: "guess-item",
    pool: shopableItems,
    maxAttempts: MAX_ATTEMPTS,
    date: dateParam,
    hintsOf: itemHints,
  });

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
      <GuessFeedback type={feedbackType} triggerKey={shakeKey} message={feedbackMessage} />

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
        <GuessInput options={guessOptions} onSubmit={guess} disabled={isFinished} placeholder="GUESS THE ITEM..." />
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
