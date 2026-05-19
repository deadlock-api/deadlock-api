import { createFileRoute } from "@tanstack/react-router";
import type { AbilityV2, HeroV2 } from "assets_deadlock_api_client";
import { motion } from "framer-motion";
import { useMemo, useState } from "react";

import { GameShell } from "~/components/deadlockdle/GameShell";
import { GuessFeedback } from "~/components/deadlockdle/GuessFeedback";
import { GuessInput } from "~/components/deadlockdle/GuessInput";
import { HintReveal } from "~/components/deadlockdle/HintReveal";
import { ResultModal } from "~/components/deadlockdle/ResultModal";
import { LoadingLogo } from "~/components/LoadingLogo";
import { useAbilities, useHeroes } from "~/lib/deadlockdle/queries";
import { getModeSeed, seededPick, seededRandom } from "~/lib/deadlockdle/seed";
import { useDailyGame } from "~/lib/deadlockdle/use-daily-game";
import { seo } from "~/lib/seo";
import { cn } from "~/lib/utils";
import { filterPlayableHeroes } from "~/queries/asset-queries";

export const Route = createFileRoute("/deadlockdle/guess-ability")({
  component: GuessAbility,
  head: () =>
    seo({
      title: "Guess the Ability - Deadlockdle | Deadlock API",
      description: "Can you name the ability from its icon? Daily puzzle with progressive hints.",
      path: "/deadlockdle/guess-ability",
    }),
});

const MAX_ATTEMPTS = 5;

const VALID_ABILITY_TYPES = new Set(["signature", "ultimate", "innate"]);

function formatAbilityType(abilityType: string): string {
  switch (abilityType) {
    case "signature":
      return "Signature Ability";
    case "ultimate":
      return "Ultimate";
    case "innate":
      return "Innate";
    default:
      return abilityType.charAt(0).toUpperCase() + abilityType.slice(1);
  }
}

interface GuessableAbility {
  ability: AbilityV2;
  hero: HeroV2;
}

function buildGuessableAbilities(abilities: AbilityV2[], playableHeroes: HeroV2[]): GuessableAbility[] {
  const heroMap = new Map<number, HeroV2>();
  for (const hero of playableHeroes) {
    heroMap.set(hero.id, hero);
  }

  const results: GuessableAbility[] = [];
  for (const ability of abilities) {
    if (!ability.hero) continue;
    if (!ability.image && !ability.image_webp) continue;
    if (!ability.ability_type || !VALID_ABILITY_TYPES.has(ability.ability_type)) continue;

    const hero = heroMap.get(ability.hero);
    if (!hero) continue;

    results.push({ ability, hero });
  }

  return results;
}

function GuessAbility() {
  const { data: heroes, isLoading: heroesLoading } = useHeroes();
  const { data: abilities, isLoading: abilitiesLoading } = useAbilities();
  const { gameState, streakState, isFinished, submitGuess, today } = useDailyGame("guess-ability", MAX_ATTEMPTS);

  const [shakeKey, setShakeKey] = useState(0);
  const [feedbackType, setFeedbackType] = useState<"correct" | "wrong" | null>(null);

  const playableHeroes = useMemo(() => (heroes ? filterPlayableHeroes(heroes) : []), [heroes]);

  const guessableAbilities = useMemo(
    () => (abilities ? buildGuessableAbilities(abilities as AbilityV2[], playableHeroes) : []),
    [abilities, playableHeroes],
  );

  const dailyEntry = useMemo(() => {
    if (guessableAbilities.length === 0) return null;
    const seed = getModeSeed(today, "guess-ability");
    const rng = seededRandom(seed);
    return seededPick(guessableAbilities, rng);
  }, [guessableAbilities, today]);

  const hints = useMemo(() => {
    if (!dailyEntry) return [];

    const { ability, hero } = dailyEntry;

    const abilityTypeLabel = ability.ability_type ? formatAbilityType(ability.ability_type) : "Unknown";

    const heroType = hero.hero_type ? hero.hero_type.charAt(0).toUpperCase() + hero.hero_type.slice(1) : "Unknown";

    const heroName = hero.name;

    const rawDesc = ability.description?.desc?.replace(/<[^>]*>/g, "") ?? "";
    const descTruncated = rawDesc
      ? rawDesc.length > 120
        ? `${rawDesc.slice(0, 120)}...`
        : rawDesc
      : "No description available";

    return [
      { label: "TYPE", value: abilityTypeLabel },
      { label: "HERO TYPE", value: `${heroType} hero` },
      { label: "HERO", value: heroName },
      { label: "DESC", value: descTruncated },
    ];
  }, [dailyEntry]);

  const guessOptions = useMemo(() => {
    const guessedSet = new Set(gameState.guesses.map((g) => g.toLowerCase()));
    const seen = new Set<string>();
    return guessableAbilities
      .filter((a) => {
        const lower = a.ability.name.toLowerCase();
        if (guessedSet.has(lower) || seen.has(lower)) return false;
        seen.add(lower);
        return true;
      })
      .map((a) => ({ id: a.ability.id, name: a.ability.name }));
  }, [guessableAbilities, gameState.guesses]);

  function handleGuess(_id: string | number, name: string) {
    if (!dailyEntry || isFinished) return;
    const correct = name.toLowerCase() === dailyEntry.ability.name.toLowerCase();
    submitGuess(name, correct);
    setFeedbackType(correct ? "correct" : "wrong");
    setTimeout(() => setFeedbackType(null), 900);
    if (!correct) {
      setShakeKey((k) => k + 1);
    }
  }

  const isLoading = heroesLoading || abilitiesLoading;

  if (isLoading || !dailyEntry) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <LoadingLogo className="h-16 w-16 animate-pulse" />
      </div>
    );
  }

  const { ability, hero } = dailyEntry;
  const abilityImgSrc = ability.image_webp ?? ability.image ?? "";

  return (
    <GameShell
      title="Guess the Ability"
      subtitle="Name the ability from its icon"
      totalAttempts={MAX_ATTEMPTS}
      usedAttempts={gameState.guesses.length}
      status={gameState.status}
    >
      <GuessFeedback type={feedbackType} triggerKey={shakeKey} />

      <motion.div
        key={shakeKey}
        animate={shakeKey > 0 ? { x: [-8, 8, -4, 4, 0] } : undefined}
        transition={{ duration: 0.35, ease: "easeInOut" }}
        className="flex justify-center"
      >
        <div className="relative">
          <picture>
            {ability.image_webp && <source srcSet={ability.image_webp} type="image/webp" />}
            {ability.image && <source srcSet={ability.image} type="image/png" />}
            <img
              src={abilityImgSrc}
              alt="Mystery ability"
              className="h-28 w-28 object-contain sm:h-[160px] sm:w-[160px]"
              draggable={false}
            />
          </picture>
          {isFinished && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-2 text-center">
              <p className="font-mono text-sm font-semibold text-foreground">{ability.name}</p>
              <p className="font-mono text-xs text-muted-foreground/50">{hero.name}</p>
            </motion.div>
          )}
        </div>
      </motion.div>

      {hints.length > 0 && <HintReveal hints={hints} revealedCount={gameState.hintsRevealed} />}

      <div className="flex justify-center">
        <GuessInput
          options={guessOptions}
          onSubmit={handleGuess}
          disabled={isFinished}
          placeholder="GUESS THE ABILITY..."
        />
      </div>

      {gameState.guesses.length > 0 && (
        <div className="space-y-1.5">
          <p className="font-mono text-[10px] tracking-wider text-muted-foreground/40 uppercase">Previous Guesses</p>
          <div className="flex flex-wrap gap-2">
            {gameState.guesses.map((guess) => {
              const isCorrect = guess.toLowerCase() === ability.name.toLowerCase();
              return (
                <span
                  key={guess}
                  className={cn(
                    "border px-2.5 py-1 font-mono text-xs",
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

      <ResultModal
        open={isFinished}
        status={gameState.status}
        answer={ability.name}
        mode="guess-ability"
        date={today}
        guesses={gameState.guesses}
        maxAttempts={MAX_ATTEMPTS}
        streakState={streakState}
      />
    </GameShell>
  );
}
