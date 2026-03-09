import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import type { MetaFunction } from "react-router";
import { LoadingLogo } from "~/components/LoadingLogo";
import { createPageMeta } from "~/lib/meta";
import { cn } from "~/lib/utils";
import { GameShell } from "./components/GameShell";
import { GuessInput } from "./components/GuessInput";
import { HintReveal } from "./components/HintReveal";
import { ResultModal } from "./components/ResultModal";
import { filterShopableItems, useItems } from "./lib/queries";
import { getDailySeed, seededPick, seededRandom } from "./lib/seed";
import { useDailyGame } from "./lib/use-daily-game";

export const meta: MetaFunction = () => {
  return createPageMeta({
    title: "Guess the Item - Deadlockdle | Deadlock API",
    description: "Can you identify the Deadlock item from a blurred image? Daily puzzle with progressive hints.",
    path: "/deadlockdle/guess-item",
  });
};

const MAX_ATTEMPTS = 5;

/** Blur levels in px, indexed by hintsRevealed count */
const BLUR_STEPS = [20, 14, 8, 3, 0];

function getBlurFilter(hintsRevealed: number, isFinished: boolean): string {
  if (isFinished) return "none";
  const blur = BLUR_STEPS[Math.min(hintsRevealed, BLUR_STEPS.length - 1)];
  return `blur(${blur}px)`;
}

/** Format item_slot_type for display: "weapon" -> "Weapon" */
function formatSlotType(slot: string): string {
  return slot.charAt(0).toUpperCase() + slot.slice(1);
}

/**
 * Extract a meaningful property hint from the item's properties object.
 * Finds the first property with both a label and a numeric value.
 */
function getPropertyHint(
  properties: Record<string, { value?: unknown; label?: string | null }> | null | undefined,
): string {
  if (!properties) return "No properties available";

  for (const [, prop] of Object.entries(properties)) {
    if (prop.label && prop.value != null && typeof prop.value === "number") {
      return `${prop.label}: ${prop.value}`;
    }
  }

  // Fallback: try any property with a label and stringable value
  for (const [, prop] of Object.entries(properties)) {
    if (prop.label && prop.value != null) {
      return `${prop.label}: ${String(prop.value)}`;
    }
  }

  return "No properties available";
}

export default function GuessItem() {
  const { data: items, isLoading } = useItems();
  const { gameState, streakState, isFinished, submitGuess, today } = useDailyGame("guess-item", MAX_ATTEMPTS);

  const [shakeKey, setShakeKey] = useState(0);

  const shopableItems = useMemo(() => (items ? filterShopableItems(items) : []), [items]);

  const dailyItem = useMemo(() => {
    if (shopableItems.length === 0) return null;
    const seed = getDailySeed(today);
    const rng = seededRandom(seed);
    return seededPick(shopableItems, rng);
  }, [shopableItems, today]);

  const hints = useMemo(() => {
    if (!dailyItem) return [];

    const tierSlot = `Tier ${dailyItem.item_tier} — ${formatSlotType(dailyItem.item_slot_type)}`;

    const costHint = dailyItem.cost != null ? `Cost: ${dailyItem.cost} Souls` : "Cost: Unknown";

    const propertyHint = getPropertyHint(
      dailyItem.properties as Record<string, { value?: unknown; label?: string | null }> | null,
    );

    return [
      { label: "CATEGORY", value: tierSlot },
      { label: "COST", value: costHint },
      { label: "PROPERTY", value: propertyHint },
      { label: "REVEAL", value: "Image blur greatly reduced" },
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
    if (!correct) {
      setShakeKey((k) => k + 1);
    }
  }

  if (isLoading || !dailyItem) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <LoadingLogo className="w-16 h-16 animate-pulse" />
      </div>
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
    >
      {/* Item image with progressive blur */}
      <motion.div
        key={shakeKey}
        animate={shakeKey > 0 ? { x: [-8, 8, -4, 4, 0] } : undefined}
        transition={{ duration: 0.35, ease: "easeInOut" }}
        className="flex justify-center"
      >
        <div className="relative">
          <picture>
            {dailyItem.shop_image_webp && <source srcSet={dailyItem.shop_image_webp} type="image/webp" />}
            {dailyItem.shop_image && <source srcSet={dailyItem.shop_image} type="image/png" />}
            <img
              src={itemImgSrc}
              alt="Mystery item"
              className="w-[160px] h-[160px] object-contain transition-all duration-500"
              style={{
                filter: getBlurFilter(gameState.hintsRevealed, isFinished),
              }}
              draggable={false}
            />
          </picture>
          {isFinished && (
            <motion.p
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center mt-2 text-sm font-mono font-semibold text-foreground"
            >
              {dailyItem.name}
            </motion.p>
          )}
        </div>
      </motion.div>

      {/* Progressive hints */}
      {hints.length > 0 && <HintReveal hints={hints} revealedCount={gameState.hintsRevealed} />}

      {/* Guess input */}
      <div className="flex justify-center">
        <GuessInput
          options={guessOptions}
          onSubmit={handleGuess}
          disabled={isFinished}
          placeholder="GUESS THE ITEM..."
        />
      </div>

      {/* Previous guesses */}
      {gameState.guesses.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/40">Previous Guesses</p>
          <div className="flex flex-wrap gap-2">
            {gameState.guesses.map((guess, i) => {
              const isCorrect = guess.toLowerCase() === dailyItem.name.toLowerCase();
              return (
                <span
                  key={`${guess}-${i}`}
                  className={cn(
                    "px-2.5 py-1 text-xs font-mono border",
                    isCorrect
                      ? "border-green-500/40 bg-green-500/10 text-green-400"
                      : "border-primary/20 bg-primary/5 text-primary/70",
                  )}
                >
                  {guess}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Result modal */}
      <ResultModal
        open={isFinished}
        status={gameState.status}
        answer={dailyItem.name}
        mode="guess-item"
        date={today}
        guesses={gameState.guesses}
        maxAttempts={MAX_ATTEMPTS}
        streakState={streakState}
      />
    </GameShell>
  );
}
