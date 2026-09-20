import { createFileRoute } from "@tanstack/react-router";
import type { Ability } from "deadlock_api_client";
import { motion } from "framer-motion";
import { Volume2, VolumeX } from "lucide-react";
import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { PlayButton } from "~/components/domain/minigames/PlayButton";
import { GameShell } from "~/components/features/deadlockdle/GameShell";
import { GuessFeedback } from "~/components/features/deadlockdle/GuessFeedback";
import { GuessInput } from "~/components/features/deadlockdle/GuessInput";
import { HintReveal } from "~/components/features/deadlockdle/HintReveal";
import { PreviousGuesses } from "~/components/features/deadlockdle/PreviousGuesses";
import { ResultModal } from "~/components/features/deadlockdle/ResultModal";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { Button } from "~/components/ui/button";
import { Field } from "~/components/ui/field";
import { ProgressBar } from "~/components/ui/progress-bar";
import { Slider } from "~/components/ui/slider";
import { Stack } from "~/components/ui/stack";
import { useAbilities, useHeroes, useSounds } from "~/lib/deadlockdle/queries";
import { getModeSeed, seededPick, seededRandom, validatePuzzleDateSearch } from "~/lib/deadlockdle/seed";
import { useDailyGame } from "~/lib/deadlockdle/use-daily-game";
import { seo } from "~/lib/seo";
import { filterPlayableHeroes } from "~/queries/asset-queries";

export const Route = createFileRoute("/games_/deadlockdle/guess-sound")({
  component: GuessSound,
  validateSearch: validatePuzzleDateSearch,
  head: () =>
    seo({
      title: "Guess the Sound - Deadlockdle | Deadlock API",
      description: "Can you identify the Deadlock ability from its sound? Listen and guess.",
      path: "/games/deadlockdle/guess-sound",
    }),
});

const MAX_ATTEMPTS = 4;

const VALID_ABILITY_TYPES = new Set(["signature", "ultimate", "innate"]);

interface PlayableSound {
  abilityName: string;
  url: string;
  heroCodename: string;
  heroName: string;
  heroId: number;
}

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

const CAST_FILE = /^(.+?)_cast(_01)?$/;
const PARTIAL_CAST = /lyr|layer|pre_?cast|delay|global|distant|loop|_lp$/;

function compact(value: string): string {
  return value.replaceAll(/[^a-z0-9]/g, "");
}

function matchAbility(slug: string, heroAbilities: Ability[]): string | null {
  if (slug.length < 3 || /^a\d+$/.test(slug)) return null;

  for (const ability of heroAbilities) {
    if (compact(ability.class_name.toLowerCase()).includes(compact(slug))) return ability.name;
    if (compact(ability.name.toLowerCase()) === compact(slug)) return ability.name;
  }

  return null;
}

/**
 * Sound folders keep stale ability slots (Pocket's barrage sounds live under `a1_plasma_flux`,
 * Mirage's `a1_beetles` holds `mirage_a2_beetle_*`), so the file name is trusted over its folder.
 */
function resolveAbilityName(path: string, heroCodename: string, heroAbilities: Ability[]): string | null {
  const segments = path.toLowerCase().split("/");
  const fileMatch = segments.at(-1)?.match(CAST_FILE);
  if (!fileMatch) return null;

  const prefix = fileMatch[1];
  const fileSlugs = [
    prefix.match(/(?:^|_)a\d+_(.+)$/)?.[1],
    prefix.startsWith(`${heroCodename}_`) ? prefix.slice(heroCodename.length + 1) : undefined,
    prefix,
  ];
  for (const slug of fileSlugs) {
    const name = slug ? matchAbility(slug, heroAbilities) : null;
    if (name) return name;
  }

  for (const segment of segments.slice(0, -1).reverse()) {
    const folderSlug = segment.match(/^a\d+_(.+)$/)?.[1];
    const name = folderSlug ? matchAbility(folderSlug, heroAbilities) : null;
    if (name) return name;
  }

  return null;
}

function extractPlayableSounds(
  soundsData: Record<string, unknown>,
  codenameMap: Map<string, { id: number; name: string }>,
  abilitiesByHero: Map<number, Ability[]>,
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
      // Unprefixed `cast.mp3` files are shared leftovers — Abrams' `a2_charge/cast.mp3` sits next to
      // step sounds byte-identical to Dynamo's retired charged tackle. Only named files are trusted.
      const file = path.toLowerCase().split("/").at(-1) ?? "";
      if (PARTIAL_CAST.test(file)) continue;

      const abilityName = resolveAbilityName(path, heroCodename, heroAbilityList);
      if (!abilityName) continue;

      // Keyed on the hero id, not the codename: Pocket ships the same files under `pocket` and `synth`.
      const key = `${heroInfo.id}:${abilityName}`;
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

function buildAbilitiesByHero(abilities: Ability[]): Map<number, Ability[]> {
  const map = new Map<number, Ability[]>();
  for (const ability of abilities) {
    if (!ability.hero || !ability.ability_type || !VALID_ABILITY_TYPES.has(ability.ability_type)) continue;
    const list = map.get(ability.hero) ?? [];
    list.push(ability);
    map.set(ability.hero, list);
  }
  return map;
}

function startProgressLoop(
  audioRef: RefObject<HTMLAudioElement | null>,
  animRef: RefObject<number>,
  setProgress: (progress: number) => void,
) {
  const tick = () => {
    const audio = audioRef.current;
    if (audio?.duration) {
      setProgress(audio.currentTime / audio.duration);
    }
    if (audio && !audio.paused) {
      animRef.current = requestAnimationFrame(tick);
    }
  };
  animRef.current = requestAnimationFrame(tick);
}

function useAudioPlayer(url: string | null) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(() => {
    if (typeof window === "undefined") return 0.7;
    try {
      const saved = localStorage.getItem("deadlockdle:sound-volume");
      return saved ? Number.parseFloat(saved) : 0.7;
    } catch {
      return 0.7;
    }
  });
  const animRef = useRef<number>(0);
  const [prevUrl, setPrevUrl] = useState(url);

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

  const stopProgressLoop = useCallback(() => {
    cancelAnimationFrame(animRef.current);
  }, []);

  const togglePlayPause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (audio.paused) {
      audio.volume = volume;
      audio.play();
      setIsPlaying(true);
      startProgressLoop(audioRef, animRef, setProgress);
    } else {
      audio.pause();
      setIsPlaying(false);
      stopProgressLoop();
    }
  }, [volume, stopProgressLoop]);

  const handleEnded = useCallback(() => {
    setIsPlaying(false);
    setProgress(0);
    stopProgressLoop();
  }, [stopProgressLoop]);

  const handleLoadedMetadata = useCallback(() => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
      audioRef.current.volume = volume;
    }
  }, [volume]);

  useEffect(() => {
    return stopProgressLoop;
  }, [stopProgressLoop]);

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

function GuessSound() {
  const { data: heroes, isLoading: heroesLoading } = useHeroes();
  const { data: soundsData, isLoading: soundsLoading } = useSounds();
  const { data: rawAbilities, isLoading: abilitiesLoading } = useAbilities();
  const { date: dateParam } = Route.useSearch();
  const { gameState, streakState, isFinished, submitGuess, date, isArchive } = useDailyGame(
    "guess-sound",
    MAX_ATTEMPTS,
    dateParam,
  );

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
    () => (rawAbilities ? buildAbilitiesByHero(rawAbilities as Ability[]) : new Map<number, Ability[]>()),
    [rawAbilities],
  );

  const allSounds = useMemo(() => {
    if (!soundsData) return [];
    return extractPlayableSounds(soundsData, codenameMap, abilitiesByHero);
  }, [soundsData, codenameMap, abilitiesByHero]);

  const dailySound = useMemo(() => {
    if (allSounds.length === 0) return null;
    const seed = getModeSeed(date, "guess-sound");
    const rng = seededRandom(seed);
    return seededPick(allSounds, rng);
  }, [allSounds, date]);

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

  const allAbilityNames = useMemo(() => {
    const names: { id: number; name: string }[] = [];
    const seen = new Set<string>();
    for (const sound of allSounds) {
      const lower = sound.abilityName.toLowerCase();
      if (seen.has(lower)) continue;
      seen.add(lower);
      names.push({ id: names.length, name: sound.abilityName });
    }
    if (rawAbilities) {
      for (const ability of rawAbilities as Ability[]) {
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
    return <LoadingState label="puzzle" />;
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
      date={date}
    >
      <GuessFeedback type={feedbackType} triggerKey={shakeKey} />

      <motion.div
        key={shakeKey}
        animate={shakeKey > 0 ? { x: [-8, 8, -4, 4, 0] } : undefined}
        transition={{ duration: 0.35, ease: "easeInOut" }}
        className="flex flex-col items-center gap-4"
      >
        {/* eslint-disable-next-line jsx-a11y/media-has-caption -- Game sound effect used as puzzle content */}
        <audio
          ref={audioRef}
          src={dailySound.url}
          preload="auto"
          aria-label="Ability sound clip"
          onEnded={handleEnded}
          onLoadedMetadata={handleLoadedMetadata}
        >
          <track kind="captions" />
        </audio>

        <PlayButton
          state={isPlaying ? "playing" : "idle"}
          label="sound"
          onClick={togglePlayPause}
          className="cursor-target size-16 sm:size-20 md:size-24"
        />

        <Stack gap={1.5} className="w-full max-w-xs">
          <ProgressBar value={progress} />
          <div className="flex items-center justify-between font-mono text-3xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Volume2 className="size-3" />
              SOUND
            </span>
            <span>{formattedDuration}</span>
          </div>
        </Stack>

        <Field label="Volume" labelDisplay="hidden" orientation="horizontal" className="w-full max-w-xs">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => changeVolume(isMuted ? 0.7 : 0)}
            aria-label={isMuted ? "Unmute" : "Mute"}
            className="cursor-target text-muted-foreground"
          >
            {isMuted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
          </Button>
          <Slider
            aria-label="Volume"
            min={0}
            max={1}
            step={0.01}
            value={[volume]}
            onValueChange={([next]) => changeVolume(next)}
            className="cursor-target flex-1"
          />
          <span className="w-7 text-end font-mono text-3xs text-muted-foreground tabular-nums">
            {Math.round(volume * 100)}
          </span>
        </Field>

        {isFinished && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="text-center">
            <p className="font-mono text-sm font-semibold text-foreground">{dailySound.abilityName}</p>
            <p className="font-mono text-xs text-muted-foreground">{dailySound.heroName}</p>
          </motion.div>
        )}
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

      <PreviousGuesses guesses={gameState.guesses} answer={dailySound.abilityName} />

      <ResultModal
        open={isFinished}
        status={gameState.status}
        answer={dailySound.abilityName}
        mode="guess-sound"
        date={date}
        guesses={gameState.guesses}
        maxAttempts={MAX_ATTEMPTS}
        streakState={streakState}
        isArchive={isArchive}
      />
    </GameShell>
  );
}
