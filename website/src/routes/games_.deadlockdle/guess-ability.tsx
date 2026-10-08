import { createFileRoute } from "@tanstack/react-router";
import type { Ability } from "deadlock_api_client";
import { motion } from "framer-motion";
import { useMemo } from "react";

import { GameShell, GameShellError, GameShellLoading } from "~/components/features/deadlockdle/GameShell";
import { GuessFeedback } from "~/components/features/deadlockdle/GuessFeedback";
import { GuessInput } from "~/components/features/deadlockdle/GuessInput";
import { HintReveal } from "~/components/features/deadlockdle/HintReveal";
import { PreviousGuesses } from "~/components/features/deadlockdle/PreviousGuesses";
import { ResultModal } from "~/components/features/deadlockdle/ResultModal";
import { useDailyGuess } from "~/components/features/deadlockdle/use-daily-guess";
import { Stack } from "~/components/ui/stack";
import { abilityHints, buildGuessableAbilities } from "~/lib/deadlockdle/hints";
import { useAbilities, useHeroes, puzzleLoadError } from "~/lib/deadlockdle/queries";
import { validatePuzzleDateSearch } from "~/lib/deadlockdle/seed";
import { pageTitle, seo } from "~/lib/seo";
import { filterPlayableHeroes } from "~/queries/asset-queries";

export const Route = createFileRoute("/games_/deadlockdle/guess-ability")({
  component: GuessAbility,
  validateSearch: validatePuzzleDateSearch,
  head: () =>
    seo({
      title: pageTitle("Guess the Ability - Deadlockdle"),
      description: "Can you name the ability from its icon? Daily puzzle with progressive hints.",
      path: "/games/deadlockdle/guess-ability",
    }),
});

const MAX_ATTEMPTS = 5;

function GuessAbility() {
  const heroesQuery = useHeroes();
  const { data: heroes, isLoading: heroesLoading } = heroesQuery;
  const abilitiesQuery = useAbilities();
  const { data: abilities, isLoading: abilitiesLoading } = abilitiesQuery;
  const { date: dateParam } = Route.useSearch();
  const guessableAbilities = useMemo(
    () => (abilities && heroes ? buildGuessableAbilities(abilities as Ability[], filterPlayableHeroes(heroes)) : []),
    [abilities, heroes],
  );
  const {
    gameState,
    streakState,
    isFinished,
    date,
    isArchive,
    answer: dailyEntry,
    hints,
    guessOptions,
    guess,
    shakeKey,
    feedbackType,
    feedbackMessage,
  } = useDailyGuess({
    mode: "guess-ability",
    pool: guessableAbilities,
    maxAttempts: MAX_ATTEMPTS,
    date: dateParam,
    hintsOf: abilityHints,
  });

  const isLoading = heroesLoading || abilitiesLoading;

  // A failed query leaves no puzzle to build, so without this the loader would spin forever.
  const loadError = puzzleLoadError(heroesQuery, abilitiesQuery);
  if (loadError.isError) {
    return (
      <GameShellError
        title="Guess the Ability"
        subtitle="Name the ability from its icon"
        date={date}
        onRetry={loadError.retry}
        retrying={loadError.retrying}
      />
    );
  }

  if (isLoading || !dailyEntry) {
    return <GameShellLoading title="Guess the Ability" subtitle="Name the ability from its icon" date={date} />;
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
          <picture>
            {ability.image_webp && <source srcSet={ability.image_webp} type="image/webp" />}
            {ability.image && <source srcSet={ability.image} type="image/png" />}
            <img
              src={abilityImgSrc}
              alt="Mystery ability"
              className="h-28 w-28 object-contain sm:h-40 sm:w-40"
              draggable={false}
            />
          </picture>
          {isFinished && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="text-center">
              <p className="font-mono text-sm font-semibold text-foreground">{ability.name}</p>
              <p className="font-mono text-xs text-muted-foreground">{hero.name}</p>
            </motion.div>
          )}
        </Stack>
      </motion.div>

      {hints.length > 0 && <HintReveal hints={hints} revealedCount={gameState.hintsRevealed} />}

      <div className="flex justify-center">
        <GuessInput options={guessOptions} onSubmit={guess} disabled={isFinished} placeholder="GUESS THE ABILITY..." />
      </div>

      <PreviousGuesses guesses={gameState.guesses} answer={ability.name} />

      <ResultModal
        open={isFinished}
        status={gameState.status}
        answer={ability.name}
        mode="guess-ability"
        date={date}
        guesses={gameState.guesses}
        maxAttempts={MAX_ATTEMPTS}
        streakState={streakState}
        isArchive={isArchive}
      />
    </GameShell>
  );
}
