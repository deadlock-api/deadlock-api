import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useMemo, useState } from "react";

import { GameShell } from "~/components/deadlockdle/GameShell";
import { GuessFeedback } from "~/components/deadlockdle/GuessFeedback";
import { GuessInput } from "~/components/deadlockdle/GuessInput";
import { HintReveal } from "~/components/deadlockdle/HintReveal";
import { ResultModal } from "~/components/deadlockdle/ResultModal";
import { LoadingLogo } from "~/components/LoadingLogo";
import { useHeroes } from "~/lib/deadlockdle/queries";
import { getModeSeed, seededPick, seededRandom } from "~/lib/deadlockdle/seed";
import { useDailyGame } from "~/lib/deadlockdle/use-daily-game";
import { seo } from "~/lib/seo";
import { cn, snakeToPretty } from "~/lib/utils";
import { filterPlayableHeroes } from "~/queries/asset-queries";

export const Route = createFileRoute("/deadlockdle/guess-hero")({
  component: GuessHero,
  head: () =>
    seo({
      title: "Guess the Hero - Deadlockdle | Deadlock API",
      description: "Can you identify the Deadlock hero from their silhouette? Daily puzzle with progressive hints.",
      path: "/deadlockdle/guess-hero",
    }),
});

const MAX_ATTEMPTS = 6;

const WARP_STEPS = [
  { scale: 30, freq: 0.015, brightness: 0, saturate: 0 },
  { scale: 25, freq: 0.02, brightness: 0, saturate: 0 },
  { scale: 20, freq: 0.025, brightness: 0, saturate: 0 },
  { scale: 16, freq: 0.025, brightness: 0, saturate: 0 },
  { scale: 8, freq: 0.03, brightness: 0, saturate: 0 },
  { scale: 3, freq: 0.03, brightness: 0, saturate: 0 },
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

function getSilhouetteFilter(guessCount: number, isFinished: boolean): string {
  if (isFinished) return "none";
  const i = Math.min(guessCount, WARP_STEPS.length - 1);
  const step = WARP_STEPS[i];
  return `url(#dldle-warp-${i}) brightness(${step.brightness}) saturate(${step.saturate})`;
}

function GuessHero() {
  const { data: heroes, isLoading } = useHeroes();
  const { gameState, streakState, isFinished, submitGuess, today } = useDailyGame("guess-hero", MAX_ATTEMPTS);

  const [shakeKey, setShakeKey] = useState(0);
  const [feedbackType, setFeedbackType] = useState<"correct" | "wrong" | null>(null);

  const playableHeroes = useMemo(
    () => (heroes ? filterPlayableHeroes(heroes).filter((h) => h.hero_type) : []),
    [heroes],
  );

  const dailyHero = useMemo(() => {
    if (playableHeroes.length === 0) return null;
    const seed = getModeSeed(today, "guess-hero");
    const rng = seededRandom(seed);
    return seededPick(playableHeroes, rng);
  }, [playableHeroes, today]);

  const hints = useMemo(() => {
    if (!dailyHero) return [];

    const heroType = dailyHero.hero_type
      ? dailyHero.hero_type.charAt(0).toUpperCase() + dailyHero.hero_type.slice(1)
      : "Unknown";

    const startingStatEntries = Object.entries(dailyHero.starting_stats) as [
      string,
      { value: unknown; display_stat_name: string },
    ][];
    const statEntry = startingStatEntries.find(([key]) => key === "max_health");
    const statHint = statEntry
      ? `Base ${snakeToPretty(statEntry[0])}: ${statEntry[1].value}`
      : startingStatEntries.length > 0
        ? `Base ${snakeToPretty(startingStatEntries[0][0])}: ${startingStatEntries[0][1].value}`
        : "No stats available";

    const stripHtml = (text: string) => text.replace(/<[^>]*>/g, "");
    const redact = (text: string) => stripHtml(text).replace(new RegExp(dailyHero.name, "gi"), "???");

    const lore = dailyHero.description?.lore;
    const loreRedacted = lore ? redact(lore) : null;
    const loreTruncated = loreRedacted
      ? loreRedacted.length > 100
        ? `${loreRedacted.slice(0, 100)}...`
        : loreRedacted
      : "No lore available";

    const playstyle = dailyHero.description?.playstyle;
    const role = dailyHero.description?.role;
    const secondStat = startingStatEntries.find(([key]) => key === "weapon_power" || key === "sprint_speed");
    const lastHint = playstyle
      ? { label: "PLAYSTYLE", value: redact(playstyle) }
      : role
        ? { label: "ROLE", value: redact(role) }
        : secondStat
          ? { label: "STAT 2", value: `Base ${snakeToPretty(secondStat[0])}: ${secondStat[1].value}` }
          : { label: "COMPLEXITY", value: `Complexity: ${dailyHero.complexity}` };

    return [
      { label: "TYPE", value: heroType },
      { label: "STAT", value: statHint },
      { label: "LORE", value: loreTruncated },
      { label: "WEAPON", value: dailyHero.gun_tag ?? "Unknown" },
      lastHint,
    ];
  }, [dailyHero]);

  const guessOptions = useMemo(() => {
    const guessedSet = new Set(gameState.guesses.map((g) => g.toLowerCase()));
    return playableHeroes.filter((h) => !guessedSet.has(h.name.toLowerCase())).map((h) => ({ id: h.id, name: h.name }));
  }, [playableHeroes, gameState.guesses]);

  function handleGuess(_id: string | number, name: string) {
    if (!dailyHero || isFinished) return;
    const correct = name.toLowerCase() === dailyHero.name.toLowerCase();
    submitGuess(name, correct);
    setFeedbackType(correct ? "correct" : "wrong");
    setTimeout(() => setFeedbackType(null), 900);
    if (!correct) {
      setShakeKey((k) => k + 1);
    }
  }

  if (isLoading || !dailyHero) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <LoadingLogo className="h-16 w-16 animate-pulse" />
      </div>
    );
  }

  const heroCardSrc = dailyHero.images?.icon_hero_card_webp ?? dailyHero.images?.icon_hero_card ?? "";

  return (
    <GameShell
      title="Guess the Hero"
      subtitle="Identify the hero from their silhouette"
      totalAttempts={MAX_ATTEMPTS}
      usedAttempts={gameState.guesses.length}
      status={gameState.status}
    >
      <GuessFeedback type={feedbackType} triggerKey={shakeKey} />
      <WarpFilters />

      <motion.div
        key={shakeKey}
        animate={shakeKey > 0 ? { x: [-8, 8, -4, 4, 0] } : undefined}
        transition={{ duration: 0.35, ease: "easeInOut" }}
        className="flex justify-center"
      >
        <div className="relative">
          <div
            className={cn(
              "relative h-32 w-32 overflow-hidden rounded-xl ring-1 transition-all duration-700 sm:h-[200px] sm:w-[200px]",
              !isFinished ? "bg-primary ring-white/10" : "bg-transparent ring-transparent",
            )}
          >
            <img
              src={heroCardSrc}
              alt="Mystery hero"
              className="h-32 w-32 object-contain transition-all duration-500 sm:h-[200px] sm:w-[200px]"
              style={{
                filter: getSilhouetteFilter(gameState.guesses.length, isFinished),
              }}
              draggable={false}
            />
          </div>
          {isFinished && (
            <motion.p
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-2 text-center font-mono text-sm font-semibold text-foreground"
            >
              {dailyHero.name}
            </motion.p>
          )}
        </div>
      </motion.div>

      {hints.length > 0 && <HintReveal hints={hints} revealedCount={gameState.hintsRevealed} />}

      <div className="flex justify-center">
        <GuessInput
          options={guessOptions}
          onSubmit={handleGuess}
          disabled={isFinished}
          placeholder="GUESS THE HERO..."
        />
      </div>

      {gameState.guesses.length > 0 && (
        <div className="space-y-1.5">
          <p className="font-mono text-[10px] tracking-wider text-muted-foreground/40 uppercase">Previous Guesses</p>
          <div className="flex flex-wrap gap-2">
            {gameState.guesses.map((guess) => {
              const isCorrect = guess.toLowerCase() === dailyHero.name.toLowerCase();
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
        answer={dailyHero.name}
        mode="guess-hero"
        date={today}
        guesses={gameState.guesses}
        maxAttempts={MAX_ATTEMPTS}
        streakState={streakState}
      />
    </GameShell>
  );
}
