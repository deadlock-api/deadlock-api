import { motion } from "framer-motion";
import { Pause, Play, Volume2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MetaFunction } from "react-router";
import { LoadingLogo } from "~/components/LoadingLogo";
import { createPageMeta } from "~/lib/meta";
import { cn } from "~/lib/utils";
import { GameShell } from "./components/GameShell";
import { GuessInput } from "./components/GuessInput";
import { HintReveal } from "./components/HintReveal";
import { ResultModal } from "./components/ResultModal";
import { filterPlayableHeroes, useHeroes, useSounds } from "./lib/queries";
import { getDailySeed, seededPick, seededRandom, seededShuffle } from "./lib/seed";
import { useDailyGame } from "./lib/use-daily-game";

export const meta: MetaFunction = () => {
  return createPageMeta({
    title: "Guess the Sound - Deadlockdle | Deadlock API",
    description: "Can you identify the Deadlock sound? Listen and guess what hero or item it belongs to.",
    path: "/deadlockdle/guess-sound",
  });
};

const MAX_ATTEMPTS = 4;

// ---------------------------------------------------------------------------
// Sound data extraction
// ---------------------------------------------------------------------------

interface PlayableSound {
  /** Display-friendly label, e.g. "Ability Cast" */
  label: string;
  /** Direct .mp3 URL */
  url: string;
  /** Internal hero codename from the sounds API (e.g. "dynamo", "chrono") */
  heroCodename: string;
  /** Category for hint purposes */
  category: "ability" | "weapon";
}

/**
 * Recursively flattens a nested object into an array of [path, url] tuples.
 * Only collects string values that look like URLs.
 */
function flattenUrls(obj: unknown, prefix = ""): [string, string][] {
  const results: [string, string][] = [];
  if (typeof obj === "string" && obj.startsWith("https://")) {
    results.push([prefix, obj]);
  } else if (obj && typeof obj === "object" && !Array.isArray(obj)) {
    for (const [k, v] of Object.entries(obj)) {
      const newPrefix = prefix ? `${prefix}/${k}` : k;
      results.push(...flattenUrls(v, newPrefix));
    }
  }
  return results;
}

/**
 * Extracts playable, guessable sounds from the raw sounds API data.
 * Focuses on hero ability "cast" sounds and weapon "fire" sounds since they
 * are the most distinctive and identifiable.
 */
function extractPlayableSounds(soundsData: Record<string, unknown>, validCodenames: Set<string>): PlayableSound[] {
  const sounds: PlayableSound[] = [];
  const seen = new Set<string>();

  // 1) Ability sounds — pick "cast" sounds (most iconic per ability)
  const abilities = soundsData.abilities;
  if (abilities && typeof abilities === "object") {
    for (const [heroCodename, heroAbilities] of Object.entries(abilities as Record<string, unknown>)) {
      if (heroCodename === "shared" || !validCodenames.has(heroCodename)) continue;

      const urls = flattenUrls(heroAbilities);
      for (const [path, url] of urls) {
        const lower = path.toLowerCase();
        // Pick ability cast sounds — skip layer/lyr variants to avoid duplicates
        if (
          lower.includes("cast") &&
          !lower.includes("lyr") &&
          !lower.includes("layer") &&
          !lower.includes("precast") &&
          !lower.includes("_02") &&
          !lower.includes("_03") &&
          !lower.includes("_04") &&
          !lower.includes("_05")
        ) {
          const key = `${heroCodename}:${url}`;
          if (!seen.has(key)) {
            seen.add(key);
            // Extract ability identifier from path (e.g. "a4_singularity" -> "Ability 4")
            const abilityMatch = path.match(/a([1-4])/);
            const abilityNum = abilityMatch ? `Ability ${abilityMatch[1]}` : "Ability";
            sounds.push({
              label: `${abilityNum} Cast`,
              url,
              heroCodename,
              category: "ability",
            });
          }
        }
      }
    }
  }

  // 2) Weapon fire sounds — pick first fire sound per hero
  const weapons = soundsData.weapons;
  if (weapons && typeof weapons === "object") {
    for (const [heroCodename, heroWeapons] of Object.entries(weapons as Record<string, unknown>)) {
      if (heroCodename === "shared" || !validCodenames.has(heroCodename)) continue;

      const urls = flattenUrls(heroWeapons);
      let picked = false;
      for (const [path, url] of urls) {
        if (picked) break;
        const lower = path.toLowerCase();
        if ((lower.includes("fire") || lower.includes("shoot")) && (lower.includes("_01") || lower.includes("main"))) {
          const key = `${heroCodename}:weapon`;
          if (!seen.has(key)) {
            seen.add(key);
            sounds.push({
              label: "Weapon Fire",
              url,
              heroCodename,
              category: "weapon",
            });
            picked = true;
          }
        }
      }
    }
  }

  return sounds;
}

/**
 * Build a mapping from internal codenames (as used in the sounds API)
 * to { id, name } objects using the hero assets data.
 *
 * Hero class_name is e.g. "hero_chrono" -> codename "chrono".
 * The sounds API also uses some alternate codenames:
 *   - "krill" for Mo & Krill (class_name "hero_krill")
 *   - "ghost" for Lady Geist (class_name "hero_ghost")
 *   etc.
 */
function buildCodenameMap(
  heroes: { id: number; name: string; class_name: string }[],
): Map<string, { id: number; name: string }> {
  const map = new Map<string, { id: number; name: string }>();
  for (const hero of heroes) {
    const codename = hero.class_name.replace(/^hero_/, "");
    map.set(codename, { id: hero.id, name: hero.name });
  }
  // The sounds API sometimes uses variant codenames that differ from class_name.
  // "atlas" -> Abrams in class_name, but sounds uses "abrams" directly.
  // We add reverse lookups from sound-key names where they differ.
  // These are populated by the hero's own name lowered if their codename != name.
  for (const hero of heroes) {
    const nameLower = hero.name.toLowerCase().replace(/\s+/g, "");
    if (!map.has(nameLower)) {
      map.set(nameLower, { id: hero.id, name: hero.name });
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// Audio player hook
// ---------------------------------------------------------------------------

function useAudioPlayer(url: string | null) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const animRef = useRef<number>(0);
  const prevUrlRef = useRef(url);

  // Reset state when URL changes
  if (prevUrlRef.current !== url) {
    prevUrlRef.current = url;
    setIsPlaying(false);
    setProgress(0);
    setDuration(0);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }

  const updateProgress = useCallback(() => {
    const audio = audioRef.current;
    if (audio?.duration) {
      setProgress(audio.currentTime / audio.duration);
    }
    if (audioRef.current && !audioRef.current.paused) {
      animRef.current = requestAnimationFrame(updateProgress);
    }
  }, []);

  const togglePlayPause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (audio.paused) {
      audio.play();
      setIsPlaying(true);
      animRef.current = requestAnimationFrame(updateProgress);
    } else {
      audio.pause();
      setIsPlaying(false);
      cancelAnimationFrame(animRef.current);
    }
  }, [updateProgress]);

  const handleEnded = useCallback(() => {
    setIsPlaying(false);
    setProgress(0);
    cancelAnimationFrame(animRef.current);
  }, []);

  const handleLoadedMetadata = useCallback(() => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(animRef.current);
    };
  }, []);

  return {
    audioRef,
    isPlaying,
    progress,
    duration,
    togglePlayPause,
    handleEnded,
    handleLoadedMetadata,
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function GuessSound() {
  const { data: heroes, isLoading: heroesLoading } = useHeroes();
  const { data: soundsData, isLoading: soundsLoading } = useSounds();
  const { gameState, streakState, isFinished, submitGuess, today } = useDailyGame("guess-sound", MAX_ATTEMPTS);

  const [shakeKey, setShakeKey] = useState(0);

  const playableHeroes = useMemo(() => (heroes ? filterPlayableHeroes(heroes) : []), [heroes]);

  const codenameMap = useMemo(
    () =>
      buildCodenameMap(
        playableHeroes.map((h) => ({
          id: h.id,
          name: h.name,
          class_name: h.class_name,
        })),
      ),
    [playableHeroes],
  );

  const validCodenames = useMemo(() => {
    return new Set(codenameMap.keys());
  }, [codenameMap]);

  const allSounds = useMemo(() => {
    if (!soundsData) return [];
    return extractPlayableSounds(soundsData, validCodenames);
  }, [soundsData, validCodenames]);

  /** Today's selected sound, deterministically chosen */
  const dailySound = useMemo(() => {
    if (allSounds.length === 0) return null;
    const seed = getDailySeed(today);
    const rng = seededRandom(seed);
    // Shuffle a copy so the seed offsets are unique per game mode
    // (getDailySeed is shared, advancing the rng differentiates)
    const shuffled = seededShuffle([...allSounds], rng);
    return seededPick(shuffled, rng);
  }, [allSounds, today]);

  /** The hero this sound belongs to */
  const answerHero = useMemo(() => {
    if (!dailySound) return null;
    return codenameMap.get(dailySound.heroCodename) ?? null;
  }, [dailySound, codenameMap]);

  const { audioRef, isPlaying, progress, duration, togglePlayPause, handleEnded, handleLoadedMetadata } =
    useAudioPlayer(dailySound?.url ?? null);

  // Hints for progressive reveal
  const hints = useMemo(() => {
    if (!dailySound || !answerHero) return [];

    const categoryLabel = dailySound.category === "ability" ? "Hero Ability" : "Weapon";
    const soundTypeHint = dailySound.label; // e.g. "Ability 3 Cast", "Weapon Fire"

    // Find the hero data for extra hints
    const heroData = playableHeroes.find((h) => h.id === answerHero.id);
    const heroType = heroData?.hero_type
      ? heroData.hero_type.charAt(0).toUpperCase() + heroData.hero_type.slice(1)
      : "Unknown";

    return [
      { label: "CATEGORY", value: categoryLabel },
      { label: "TYPE", value: `${soundTypeHint} — ${heroType} hero` },
      {
        label: "INITIAL",
        value: `Hero name starts with "${answerHero.name.charAt(0)}"`,
      },
    ];
  }, [dailySound, answerHero, playableHeroes]);

  // Guess options: all playable heroes minus already guessed
  const guessOptions = useMemo(() => {
    const guessedSet = new Set(gameState.guesses.map((g) => g.toLowerCase()));
    return playableHeroes.filter((h) => !guessedSet.has(h.name.toLowerCase())).map((h) => ({ id: h.id, name: h.name }));
  }, [playableHeroes, gameState.guesses]);

  function handleGuess(_id: string | number, name: string) {
    if (!answerHero || isFinished) return;
    const correct = name.toLowerCase() === answerHero.name.toLowerCase();
    submitGuess(name, correct);
    if (!correct) {
      setShakeKey((k) => k + 1);
    }
  }

  const isLoading = heroesLoading || soundsLoading;

  if (isLoading || !dailySound || !answerHero) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <LoadingLogo className="w-16 h-16 animate-pulse" />
      </div>
    );
  }

  const formattedDuration = duration > 0 ? `${duration.toFixed(1)}s` : "--";

  return (
    <GameShell
      title="Guess the Sound"
      subtitle="Listen to the sound and identify the hero"
      totalAttempts={MAX_ATTEMPTS}
      usedAttempts={gameState.guesses.length}
      status={gameState.status}
    >
      {/* Audio player */}
      <motion.div
        key={shakeKey}
        animate={shakeKey > 0 ? { x: [-8, 8, -4, 4, 0] } : undefined}
        transition={{ duration: 0.35, ease: "easeInOut" }}
        className="flex flex-col items-center gap-4"
      >
        {/* Hidden audio element */}
        {/* biome-ignore lint/a11y/useMediaCaption: Game sound effect, no captions needed */}
        <audio
          ref={audioRef}
          src={dailySound.url}
          preload="auto"
          onEnded={handleEnded}
          onLoadedMetadata={handleLoadedMetadata}
        />

        {/* Play/Pause button */}
        <button
          type="button"
          onClick={togglePlayPause}
          className={cn(
            "relative w-24 h-24 rounded-full border-2 transition-all duration-300",
            "flex items-center justify-center",
            "bg-primary/10 border-primary/40 hover:bg-primary/20 hover:border-primary/60",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
            isPlaying && "shadow-[0_0_24px_rgba(250,68,84,0.3)] border-primary/70",
          )}
        >
          {/* Animated glow ring when playing */}
          {isPlaying && (
            <motion.div
              className="absolute inset-0 rounded-full border-2 border-primary/30"
              animate={{ scale: [1, 1.15, 1], opacity: [0.6, 0, 0.6] }}
              transition={{ duration: 1.5, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
            />
          )}
          {isPlaying ? <Pause className="w-8 h-8 text-primary" /> : <Play className="w-8 h-8 text-primary ml-1" />}
        </button>

        {/* Progress bar + duration */}
        <div className="w-full max-w-xs space-y-1.5">
          <div className="w-full h-1.5 bg-muted-foreground/10 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-primary/60 rounded-full"
              style={{ width: `${progress * 100}%` }}
              transition={{ duration: 0.05 }}
            />
          </div>
          <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground/40">
            <span className="flex items-center gap-1">
              <Volume2 className="w-3 h-3" />
              SOUND
            </span>
            <span>{formattedDuration}</span>
          </div>
        </div>

        {/* Revealed answer */}
        {isFinished && (
          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center text-sm font-mono font-semibold text-foreground"
          >
            {answerHero.name}
          </motion.p>
        )}
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
            {gameState.guesses.map((guess) => {
              const isCorrect = guess.toLowerCase() === answerHero.name.toLowerCase();
              return (
                <span
                  key={`guess-${guess}`}
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
        answer={answerHero.name}
        mode="guess-sound"
        date={today}
        guesses={gameState.guesses}
        maxAttempts={MAX_ATTEMPTS}
        streakState={streakState}
      />
    </GameShell>
  );
}
