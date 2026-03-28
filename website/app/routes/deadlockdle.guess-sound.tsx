import type { AbilityV2 } from "assets_deadlock_api_client/api";
import { motion } from "framer-motion";
import { Pause, Play, Volume2, VolumeX } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MetaFunction } from "react-router";

import { LoadingLogo } from "~/components/LoadingLogo";
import { createPageMeta } from "~/lib/meta";
import { cn } from "~/lib/utils";

import { GameShell } from "./deadlockdle/components/GameShell";
import { GuessFeedback } from "./deadlockdle/components/GuessFeedback";
import { GuessInput } from "./deadlockdle/components/GuessInput";
import { HintReveal } from "./deadlockdle/components/HintReveal";
import { ResultModal } from "./deadlockdle/components/ResultModal";
import { filterPlayableHeroes, useAbilities, useHeroes, useSounds } from "./deadlockdle/lib/queries";
import { getModeSeed, seededPick, seededRandom } from "./deadlockdle/lib/seed";
import { useDailyGame } from "./deadlockdle/lib/use-daily-game";

export const meta: MetaFunction = () => {
  return createPageMeta({
    title: "Guess the Sound - Deadlockdle | Deadlock API",
    description: "Can you identify the Deadlock ability from its sound? Listen and guess.",
    path: "/deadlockdle/guess-sound",
  });
};

const MAX_ATTEMPTS = 4;

/** Ability types we care about for matching sounds to abilities */
const VALID_ABILITY_TYPES = new Set(["signature", "ultimate", "innate"]);

// ---------------------------------------------------------------------------
// Sound data extraction
// ---------------------------------------------------------------------------

interface PlayableSound {
  /** Resolved ability display name */
  abilityName: string;
  /** Direct .mp3 URL */
  url: string;
  /** Internal hero codename */
  heroCodename: string;
  /** Hero display name for reveal */
  heroName: string;
  /** Hero ID for lookups */
  heroId: number;
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
 * Try to match a sound path's ability slug to an actual ability name.
 * Sound paths look like "a2_singularity/cast_01" — we extract the slug
 * after the ability number and match it against the hero's abilities.
 */
function resolveAbilityName(path: string, heroAbilities: AbilityV2[]): string | null {
  // Extract slug: "a2_singularity/cast_01" → "singularity"
  const slugMatch = path.match(/a\d+_([^/]+)/);
  if (!slugMatch) return null;
  const slug = slugMatch[1].toLowerCase();

  // Match slug against ability class_names or names
  for (const ability of heroAbilities) {
    if (ability.class_name.toLowerCase().includes(slug)) return ability.name;
    if (ability.name.toLowerCase().replaceAll(/[\s'-]/g, "_") === slug) return ability.name;
  }

  return null;
}

/**
 * Extracts playable, guessable sounds from the raw sounds API data.
 * Only includes ability sounds where we can resolve the specific ability name.
 */
function extractPlayableSounds(
  soundsData: Record<string, unknown>,
  codenameMap: Map<string, { id: number; name: string }>,
  abilitiesByHero: Map<number, AbilityV2[]>,
): PlayableSound[] {
  const sounds: PlayableSound[] = [];
  const seen = new Set<string>();

  const abilities = soundsData.abilities;
  if (!abilities || typeof abilities !== "object") return sounds;

  for (const [heroCodename, heroAbilities] of Object.entries(abilities as Record<string, unknown>)) {
    if (heroCodename === "shared") continue;
    const heroInfo = codenameMap.get(heroCodename);
    if (!heroInfo) continue;

    const heroAbilityList = abilitiesByHero.get(heroInfo.id);
    if (!heroAbilityList || heroAbilityList.length === 0) continue;

    const urls = flattenUrls(heroAbilities);
    for (const [path, url] of urls) {
      const lower = path.toLowerCase();
      // Only pick cast sounds, skip layer/lyr variants and duplicates
      if (
        !lower.includes("cast") ||
        lower.includes("lyr") ||
        lower.includes("layer") ||
        lower.includes("precast") ||
        lower.includes("_02") ||
        lower.includes("_03") ||
        lower.includes("_04") ||
        lower.includes("_05")
      ) {
        continue;
      }

      const abilityName = resolveAbilityName(path, heroAbilityList);
      if (!abilityName) continue;

      const key = `${heroCodename}:${abilityName}`;
      if (seen.has(key)) continue;
      seen.add(key);

      sounds.push({
        abilityName,
        url,
        heroCodename,
        heroName: heroInfo.name,
        heroId: heroInfo.id,
      });
    }
  }

  return sounds;
}

/**
 * Build a mapping from internal codenames (as used in the sounds API)
 * to { id, name } objects using the hero assets data.
 */
function buildCodenameMap(
  heroes: { id: number; name: string; class_name: string }[],
): Map<string, { id: number; name: string }> {
  const map = new Map<string, { id: number; name: string }>();
  for (const hero of heroes) {
    const codename = hero.class_name.replace(/^hero_/, "");
    map.set(codename, { id: hero.id, name: hero.name });
  }
  for (const hero of heroes) {
    const nameLower = hero.name.toLowerCase().replaceAll(/\s+/g, "");
    if (!map.has(nameLower)) {
      map.set(nameLower, { id: hero.id, name: hero.name });
    }
  }
  return map;
}

/** Group abilities by hero ID for fast lookup */
function buildAbilitiesByHero(abilities: AbilityV2[]): Map<number, AbilityV2[]> {
  const map = new Map<number, AbilityV2[]>();
  for (const ability of abilities) {
    if (!ability.hero || !ability.ability_type || !VALID_ABILITY_TYPES.has(ability.ability_type)) continue;
    const list = map.get(ability.hero) ?? [];
    list.push(ability);
    map.set(ability.hero, list);
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
  const [volume, setVolume] = useState(() => {
    try {
      const saved = localStorage.getItem("deadlockdle:sound-volume");
      return saved ? Number.parseFloat(saved) : 0.7;
    } catch {
      return 0.7;
    }
  });
  const animRef = useRef<number>(0);
  const [prevUrl, setPrevUrl] = useState(url);

  // Reset state when URL changes
  if (prevUrl !== url) {
    setPrevUrl(url);
    setIsPlaying(false);
    setProgress(0);
    setDuration(0);
  }

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  const changeVolume = useCallback((newVolume: number) => {
    const clamped = Math.max(0, Math.min(1, newVolume));
    setVolume(clamped);
    try {
      localStorage.setItem("deadlockdle:sound-volume", String(clamped));
    } catch {
      /* ignore */
    }
  }, []);

  function updateProgress() {
    const audio = audioRef.current;
    if (audio?.duration) {
      setProgress(audio.currentTime / audio.duration);
    }
    if (audioRef.current && !audioRef.current.paused) {
      animRef.current = requestAnimationFrame(updateProgress);
    }
  }

  const togglePlayPause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (audio.paused) {
      audio.volume = volume;
      audio.play();
      setIsPlaying(true);
      animRef.current = requestAnimationFrame(updateProgress);
    } else {
      audio.pause();
      setIsPlaying(false);
      cancelAnimationFrame(animRef.current);
    }
  }, [volume]);

  const handleEnded = useCallback(() => {
    setIsPlaying(false);
    setProgress(0);
    cancelAnimationFrame(animRef.current);
  }, []);

  const handleLoadedMetadata = useCallback(() => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
      audioRef.current.volume = volume;
    }
  }, [volume]);

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
    volume,
    changeVolume,
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
  const { data: rawAbilities, isLoading: abilitiesLoading } = useAbilities();
  const { gameState, streakState, isFinished, submitGuess, today } = useDailyGame("guess-sound", MAX_ATTEMPTS);

  const [shakeKey, setShakeKey] = useState(0);
  const [feedbackType, setFeedbackType] = useState<"correct" | "wrong" | null>(null);

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

  const abilitiesByHero = useMemo(
    () => (rawAbilities ? buildAbilitiesByHero(rawAbilities as AbilityV2[]) : new Map<number, AbilityV2[]>()),
    [rawAbilities],
  );

  const allSounds = useMemo(() => {
    if (!soundsData) return [];
    return extractPlayableSounds(soundsData, codenameMap, abilitiesByHero);
  }, [soundsData, codenameMap, abilitiesByHero]);

  /** Today's selected sound, deterministically chosen */
  const dailySound = useMemo(() => {
    if (allSounds.length === 0) return null;
    const seed = getModeSeed(today, "guess-sound");
    const rng = seededRandom(seed);
    return seededPick(allSounds, rng);
  }, [allSounds, today]);

  const {
    audioRef,
    isPlaying,
    progress,
    duration,
    volume,
    changeVolume,
    togglePlayPause,
    handleEnded,
    handleLoadedMetadata,
  } = useAudioPlayer(dailySound?.url ?? null);

  // Hints for progressive reveal
  const hints = useMemo(() => {
    if (!dailySound) return [];

    const heroData = playableHeroes.find((h) => h.id === dailySound.heroId);
    const heroType = heroData?.hero_type
      ? heroData.hero_type.charAt(0).toUpperCase() + heroData.hero_type.slice(1)
      : "Unknown";

    return [
      { label: "HERO TYPE", value: `${heroType} hero` },
      { label: "HERO", value: dailySound.heroName },
      { label: "INITIAL", value: `Ability name starts with "${dailySound.abilityName.charAt(0)}"` },
    ];
  }, [dailySound, playableHeroes]);

  // Build all ability names as guess options (deduplicated)
  const allAbilityNames = useMemo(() => {
    const names: { id: number; name: string }[] = [];
    const seen = new Set<string>();
    for (const sound of allSounds) {
      const lower = sound.abilityName.toLowerCase();
      if (seen.has(lower)) continue;
      seen.add(lower);
      names.push({ id: names.length, name: sound.abilityName });
    }
    // Also include abilities from the abilities API for a fuller dropdown
    if (rawAbilities) {
      for (const ability of rawAbilities as AbilityV2[]) {
        if (!ability.ability_type || !VALID_ABILITY_TYPES.has(ability.ability_type)) continue;
        if (!ability.name || !ability.hero) continue;
        const heroInfo = playableHeroes.find((h) => h.id === ability.hero);
        if (!heroInfo) continue;
        const lower = ability.name.toLowerCase();
        if (seen.has(lower)) continue;
        seen.add(lower);
        names.push({ id: ability.id, name: ability.name });
      }
    }
    return names;
  }, [allSounds, rawAbilities, playableHeroes]);

  const guessOptions = useMemo(() => {
    const guessedSet = new Set(gameState.guesses.map((g) => g.toLowerCase()));
    return allAbilityNames.filter((a) => !guessedSet.has(a.name.toLowerCase()));
  }, [allAbilityNames, gameState.guesses]);

  function handleGuess(_id: string | number, name: string) {
    if (!dailySound || isFinished) return;
    const correct = name.toLowerCase() === dailySound.abilityName.toLowerCase();
    submitGuess(name, correct);
    setFeedbackType(correct ? "correct" : "wrong");
    setTimeout(() => setFeedbackType(null), 900);
    if (!correct) {
      setShakeKey((k) => k + 1);
    }
  }

  const isLoading = heroesLoading || soundsLoading || abilitiesLoading;

  if (isLoading || !dailySound) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <LoadingLogo className="h-16 w-16 animate-pulse" />
      </div>
    );
  }

  const formattedDuration = duration > 0 ? `${duration.toFixed(1)}s` : "--";
  const isMuted = volume === 0;

  return (
    <GameShell
      title="Guess the Sound"
      subtitle="Listen to the sound and name the ability"
      totalAttempts={MAX_ATTEMPTS}
      usedAttempts={gameState.guesses.length}
      status={gameState.status}
    >
      <GuessFeedback type={feedbackType} triggerKey={shakeKey} />

      {/* Audio player */}
      <motion.div
        key={shakeKey}
        animate={shakeKey > 0 ? { x: [-8, 8, -4, 4, 0] } : undefined}
        transition={{ duration: 0.35, ease: "easeInOut" }}
        className="flex flex-col items-center gap-4"
      >
        {/* Hidden audio element */}
        {/* eslint-disable-next-line jsx-a11y/media-has-caption -- Game sound effect used as puzzle content */}
        <audio
          ref={audioRef}
          src={dailySound.url}
          preload="auto"
          onEnded={handleEnded}
          onLoadedMetadata={handleLoadedMetadata}
        >
          <track kind="captions" />
        </audio>

        {/* Play/Pause button */}
        <motion.button
          type="button"
          whileTap={{ scale: 0.93, transition: { duration: 0 } }}
          transition={{ type: "spring", stiffness: 400, damping: 17 }}
          onClick={togglePlayPause}
          className={cn(
            "relative h-16 w-16 rounded-full border-2 transition-colors duration-300 sm:h-20 sm:w-20 md:h-24 md:w-24",
            "flex items-center justify-center",
            "border-primary/40 bg-primary/10 hover:border-primary/60 hover:bg-primary/20",
            "focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:outline-none",
            isPlaying && "border-primary/70 shadow-[0_0_24px_rgba(250,68,84,0.3)]",
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
          {isPlaying ? (
            <Pause className="h-6 w-6 text-primary sm:h-7 sm:w-7 md:h-8 md:w-8" />
          ) : (
            <Play className="ml-0.5 h-6 w-6 text-primary sm:ml-1 sm:h-7 sm:w-7 md:h-8 md:w-8" />
          )}
        </motion.button>

        {/* Progress bar + duration */}
        <div className="w-full max-w-xs space-y-1.5">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted-foreground/10">
            <motion.div
              className="h-full rounded-full bg-primary/60"
              style={{ width: `${progress * 100}%` }}
              transition={{ duration: 0.05 }}
            />
          </div>
          <div className="flex items-center justify-between font-mono text-[10px] text-muted-foreground/40">
            <span className="flex items-center gap-1">
              <Volume2 className="h-3 w-3" />
              SOUND
            </span>
            <span>{formattedDuration}</span>
          </div>
        </div>

        {/* Volume slider */}
        <div className="flex w-full max-w-xs items-center gap-2">
          <button
            type="button"
            onClick={() => changeVolume(isMuted ? 0.7 : 0)}
            className="p-0.5 text-muted-foreground/50 transition-colors hover:text-foreground"
            aria-label={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(e) => changeVolume(Number.parseFloat(e.target.value))}
            className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-muted-foreground/10 [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-primary [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-0 [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow-[0_0_6px_rgba(250,68,84,0.4)]"
            aria-label="Volume"
          />
          <span className="w-7 text-right font-mono text-[10px] text-muted-foreground/40">
            {Math.round(volume * 100)}
          </span>
        </div>

        {/* Revealed answer */}
        {isFinished && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="text-center">
            <p className="font-mono text-sm font-semibold text-foreground">{dailySound.abilityName}</p>
            <p className="font-mono text-xs text-muted-foreground/50">{dailySound.heroName}</p>
          </motion.div>
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
          placeholder="GUESS THE ABILITY..."
        />
      </div>

      {/* Previous guesses */}
      {gameState.guesses.length > 0 && (
        <div className="space-y-1.5">
          <p className="font-mono text-[10px] tracking-wider text-muted-foreground/40 uppercase">Previous Guesses</p>
          <div className="flex flex-wrap gap-2">
            {gameState.guesses.map((guess) => {
              const isCorrect = dailySound && guess.toLowerCase() === dailySound.abilityName.toLowerCase();
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
        answer={dailySound.abilityName}
        mode="guess-sound"
        date={today}
        guesses={gameState.guesses}
        maxAttempts={MAX_ATTEMPTS}
        streakState={streakState}
      />
    </GameShell>
  );
}
