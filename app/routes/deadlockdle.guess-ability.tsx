import type { AbilityV2, HeroV2 } from "assets_deadlock_api_client/api";
import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import type { MetaFunction } from "react-router";
import { LoadingLogo } from "~/components/LoadingLogo";
import { createPageMeta } from "~/lib/meta";
import { cn } from "~/lib/utils";
import { GameShell } from "./deadlockdle/components/GameShell";
import { GuessInput } from "./deadlockdle/components/GuessInput";
import { HintReveal } from "./deadlockdle/components/HintReveal";
import { ResultModal } from "./deadlockdle/components/ResultModal";
import { filterPlayableHeroes, useAbilities, useHeroes } from "./deadlockdle/lib/queries";
import { getModeSeed, seededPick, seededRandom, seededShuffle } from "./deadlockdle/lib/seed";
import { useDailyGame } from "./deadlockdle/lib/use-daily-game";

export const meta: MetaFunction = () => {
  return createPageMeta({
    title: "Ability to Hero - Deadlockdle | Deadlock API",
    description: "Can you name the hero from their ability icon? Daily puzzle with progressive hints.",
    path: "/deadlockdle/guess-ability",
  });
};

const MAX_ATTEMPTS = 5;

/** Ability types that are valid for this game mode */
const VALID_ABILITY_TYPES = new Set(["signature", "ultimate", "innate"]);

/** Format ability_type for display */
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

/**
 * Filter abilities to those that are guessable: belong to a playable hero,
 * have an image, and are signature/ultimate/innate type.
 */
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

export default function GuessAbility() {
  const { data: heroes, isLoading: heroesLoading } = useHeroes();
  const { data: abilities, isLoading: abilitiesLoading } = useAbilities();
  const { gameState, streakState, isFinished, submitGuess, today } = useDailyGame("guess-ability", MAX_ATTEMPTS);

  const [shakeKey, setShakeKey] = useState(0);

  const playableHeroes = useMemo(() => (heroes ? filterPlayableHeroes(heroes) : []), [heroes]);

  const guessableAbilities = useMemo(
    () => (abilities ? buildGuessableAbilities(abilities as AbilityV2[], playableHeroes) : []),
    [abilities, playableHeroes],
  );

  /** Today's selected ability, deterministically chosen */
  const dailyEntry = useMemo(() => {
    if (guessableAbilities.length === 0) return null;
    const seed = getModeSeed(today, "guess-ability");
    const rng = seededRandom(seed);
    const shuffled = seededShuffle([...guessableAbilities], rng);
    return seededPick(shuffled, rng);
  }, [guessableAbilities, today]);

  const hints = useMemo(() => {
    if (!dailyEntry) return [];

    const { ability, hero } = dailyEntry;

    // Hint 1: Ability type
    const abilityTypeLabel = ability.ability_type ? formatAbilityType(ability.ability_type) : "Unknown";

    // Hint 2: Ability description (truncated)
    const desc = ability.description?.desc;
    const descTruncated = desc ? (desc.length > 120 ? `${desc.slice(0, 120)}...` : desc) : "No description available";

    // Hint 3: Hero type
    const heroType = hero.hero_type ? hero.hero_type.charAt(0).toUpperCase() + hero.hero_type.slice(1) : "Unknown";

    // Hint 4: Hero UI color
    const uiColor = hero.colors?.ui;
    const colorHint = uiColor ? (
      <span className="inline-flex items-center gap-2">
        <span
          className="inline-block w-5 h-5 border border-muted-foreground/30"
          style={{
            backgroundColor: `rgb(${uiColor[0]}, ${uiColor[1]}, ${uiColor[2]})`,
          }}
        />
        <span>Hero UI Color</span>
      </span>
    ) : (
      "No color available"
    );

    return [
      { label: "TYPE", value: abilityTypeLabel },
      { label: "DESC", value: descTruncated },
      { label: "HERO TYPE", value: heroType },
      { label: "COLOR", value: colorHint },
    ];
  }, [dailyEntry]);

  const guessOptions = useMemo(() => {
    const guessedSet = new Set(gameState.guesses.map((g) => g.toLowerCase()));
    return playableHeroes.filter((h) => !guessedSet.has(h.name.toLowerCase())).map((h) => ({ id: h.id, name: h.name }));
  }, [playableHeroes, gameState.guesses]);

  function handleGuess(_id: string | number, name: string) {
    if (!dailyEntry || isFinished) return;
    const correct = name.toLowerCase() === dailyEntry.hero.name.toLowerCase();
    submitGuess(name, correct);
    if (!correct) {
      setShakeKey((k) => k + 1);
    }
  }

  const isLoading = heroesLoading || abilitiesLoading;

  if (isLoading || !dailyEntry) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <LoadingLogo className="w-16 h-16 animate-pulse" />
      </div>
    );
  }

  const { ability, hero } = dailyEntry;
  const abilityImgSrc = ability.image_webp ?? ability.image ?? "";

  return (
    <GameShell
      title="Ability to Hero"
      subtitle="Name the hero this ability belongs to"
      totalAttempts={MAX_ATTEMPTS}
      usedAttempts={gameState.guesses.length}
      status={gameState.status}
    >
      {/* Ability icon image */}
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
              className="w-[160px] h-[160px] object-contain"
              draggable={false}
            />
          </picture>
          {isFinished && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="text-center mt-2">
              <p className="text-sm font-mono font-semibold text-foreground">{hero.name}</p>
              <p className="text-xs font-mono text-muted-foreground/50">{ability.name}</p>
            </motion.div>
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
          placeholder="GUESS THE HERO..."
        />
      </div>

      {/* Previous guesses */}
      {gameState.guesses.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/40">Previous Guesses</p>
          <div className="flex flex-wrap gap-2">
            {gameState.guesses.map((guess, i) => {
              const isCorrect = guess.toLowerCase() === hero.name.toLowerCase();
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
        answer={hero.name}
        mode="guess-ability"
        date={today}
        guesses={gameState.guesses}
        maxAttempts={MAX_ATTEMPTS}
        streakState={streakState}
      />
    </GameShell>
  );
}
