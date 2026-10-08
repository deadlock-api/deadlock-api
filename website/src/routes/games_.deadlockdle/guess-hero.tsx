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
import { heroHints } from "~/lib/deadlockdle/hints";
import { useHeroes, puzzleLoadError } from "~/lib/deadlockdle/queries";
import { validatePuzzleDateSearch } from "~/lib/deadlockdle/seed";
import { pageTitle, seo } from "~/lib/seo";
import { filterPlayableHeroes } from "~/queries/asset-queries";

export const Route = createFileRoute("/games_/deadlockdle/guess-hero")({
  component: GuessHero,
  validateSearch: validatePuzzleDateSearch,
  head: () =>
    seo({
      title: pageTitle("Guess the Hero - Deadlockdle"),
      description: "Can you identify the Deadlock hero from their silhouette? Daily puzzle with progressive hints.",
      path: "/games/deadlockdle/guess-hero",
    }),
});

const MAX_ATTEMPTS = 6;

const WARP_STEPS = [
  { scale: 30, freq: 0.015 },
  { scale: 25, freq: 0.02 },
  { scale: 20, freq: 0.025 },
  { scale: 16, freq: 0.025 },
  { scale: 8, freq: 0.03 },
  { scale: 3, freq: 0.03 },
];

function WarpFilters() {
  return (
    <svg width="0" height="0" className="absolute" aria-hidden="true">
      <defs>
        {WARP_STEPS.map((step, i) => (
          <filter key={step.scale} id={`dldle-warp-${i}`} x="-20%" y="-20%" width="140%" height="140%">
            <feTurbulence type="turbulence" baseFrequency={step.freq} numOctaves={3} seed={42} result="turb" />
            <feDisplacementMap
              in="SourceGraphic"
              in2="turb"
              scale={step.scale}
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        ))}
      </defs>
    </svg>
  );
}

function getWarpFilter(guessCount: number, isFinished: boolean): string {
  if (isFinished) return "none";
  const i = Math.min(guessCount, WARP_STEPS.length - 1);
  return `url(#dldle-warp-${i})`;
}

function GuessHero() {
  const heroesQuery = useHeroes();
  const { data: heroes, isLoading } = heroesQuery;
  const { date: dateParam } = Route.useSearch();
  const playableHeroes = useMemo(
    () => (heroes ? filterPlayableHeroes(heroes).filter((h) => h.hero_type) : []),
    [heroes],
  );
  const {
    gameState,
    streakState,
    isFinished,
    date,
    isArchive,
    answer: dailyHero,
    hints,
    guessOptions,
    guess,
    shakeKey,
    feedbackType,
    feedbackMessage,
  } = useDailyGuess({
    mode: "guess-hero",
    pool: playableHeroes,
    maxAttempts: MAX_ATTEMPTS,
    date: dateParam,
    hintsOf: heroHints,
  });

  // A failed query leaves no puzzle to build, so without this the loader would spin forever.
  const loadError = puzzleLoadError(heroesQuery);
  if (loadError.isError) {
    return (
      <GameShellError
        title="Guess the Hero"
        subtitle="Identify the hero from their silhouette"
        date={date}
        onRetry={loadError.retry}
        retrying={loadError.retrying}
      />
    );
  }

  if (isLoading || !dailyHero) {
    return <GameShellLoading title="Guess the Hero" subtitle="Identify the hero from their silhouette" date={date} />;
  }

  const heroCardSrc = dailyHero.images?.icon_hero_card_webp ?? dailyHero.images?.icon_hero_card ?? "";

  return (
    <GameShell
      title="Guess the Hero"
      subtitle="Identify the hero from their silhouette"
      totalAttempts={MAX_ATTEMPTS}
      usedAttempts={gameState.guesses.length}
      status={gameState.status}
      date={date}
    >
      <GuessFeedback type={feedbackType} triggerKey={shakeKey} message={feedbackMessage} />
      <WarpFilters />

      <motion.div
        key={shakeKey}
        animate={shakeKey > 0 ? { x: [-8, 8, -4, 4, 0] } : undefined}
        transition={{ duration: 0.35, ease: "easeInOut" }}
        className="flex justify-center"
      >
        <Stack gap={2}>
          <SilhouetteFrame
            state={isFinished ? "revealed" : "hidden"}
            label={isFinished ? dailyHero.name : "Mystery hero"}
            className="h-32 w-32 sm:h-50 sm:w-50"
          >
            <img
              src={heroCardSrc}
              alt="Mystery hero"
              className="h-32 w-32 object-contain sm:h-50 sm:w-50"
              style={{
                filter: getWarpFilter(gameState.guesses.length, isFinished),
              }}
              draggable={false}
            />
          </SilhouetteFrame>
          {isFinished && (
            <motion.p
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center font-mono text-sm font-semibold text-foreground"
            >
              {dailyHero.name}
            </motion.p>
          )}
        </Stack>
      </motion.div>

      {hints.length > 0 && <HintReveal hints={hints} revealedCount={gameState.hintsRevealed} />}

      <div className="flex justify-center">
        <GuessInput options={guessOptions} onSubmit={guess} disabled={isFinished} placeholder="GUESS THE HERO..." />
      </div>

      <PreviousGuesses guesses={gameState.guesses} answer={dailyHero.name} />

      <ResultModal
        open={isFinished}
        status={gameState.status}
        answer={dailyHero.name}
        mode="guess-hero"
        date={date}
        guesses={gameState.guesses}
        maxAttempts={MAX_ATTEMPTS}
        streakState={streakState}
        isArchive={isArchive}
      />
    </GameShell>
  );
}
