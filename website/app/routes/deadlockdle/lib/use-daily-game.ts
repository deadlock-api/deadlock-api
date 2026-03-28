import { usePostHog } from "@posthog/react";
import { useCallback, useState } from "react";

import { day } from "~/dayjs";

import { getTodayDate } from "./seed";
import type { DailyGameState, GameMode, GameStatus, StreakState } from "./types";

function getStorageKey(mode: GameMode, kind: "game" | "streak"): string {
  return `deadlockdle:${mode}:${kind}`;
}

function loadState<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function saveState<T>(key: string, state: T): void {
  localStorage.setItem(key, JSON.stringify(state));
}

const DEFAULT_GAME_STATE: DailyGameState = {
  date: "",
  guesses: [],
  status: "playing",
  hintsRevealed: 0,
};

const DEFAULT_STREAK_STATE: StreakState = {
  currentStreak: 0,
  maxStreak: 0,
  lastPlayedDate: "",
  gamesPlayed: 0,
  gamesWon: 0,
};

function dayDiff(a: string, b: string): number {
  return day(b).diff(day(a), "day");
}

export function useDailyGame(mode: GameMode, maxAttempts: number) {
  const today = getTodayDate();
  const posthog = usePostHog();
  const gameKey = getStorageKey(mode, "game");
  const streakKey = getStorageKey(mode, "streak");

  const [gameState, setGameState] = useState<DailyGameState>(() => {
    const saved = loadState(gameKey, DEFAULT_GAME_STATE);
    if (saved.date !== today) {
      const fresh = { ...DEFAULT_GAME_STATE, date: today };
      saveState(gameKey, fresh);
      return fresh;
    }
    return saved;
  });

  const [streakState, setStreakState] = useState<StreakState>(() => loadState(streakKey, DEFAULT_STREAK_STATE));

  const attemptsLeft = maxAttempts - gameState.guesses.length;
  const isFinished = gameState.status !== "playing";

  const updateStreak = useCallback(
    (won: boolean) => {
      setStreakState((prev) => {
        const isConsecutive = prev.lastPlayedDate === "" || dayDiff(prev.lastPlayedDate, today) === 1;
        const newStreak = won ? (isConsecutive ? prev.currentStreak + 1 : 1) : 0;
        const next: StreakState = {
          currentStreak: newStreak,
          maxStreak: Math.max(prev.maxStreak, newStreak),
          lastPlayedDate: today,
          gamesPlayed: prev.gamesPlayed + 1,
          gamesWon: prev.gamesWon + (won ? 1 : 0),
        };
        saveState(streakKey, next);
        return next;
      });
    },
    [streakKey, today],
  );

  const submitGuess = useCallback(
    (guess: string, correct: boolean) => {
      if (isFinished) return;

      setGameState((prev) => {
        if (prev.guesses.includes(guess)) return prev;
        const guesses = [...prev.guesses, guess];
        let status: GameStatus = "playing";

        if (correct) {
          status = "won";
        } else if (guesses.length >= maxAttempts) {
          status = "lost";
        }

        if (prev.guesses.length === 0) {
          posthog?.capture("deadlockdle_game_started", { mode, date: today });
        }

        if (status !== "playing") {
          posthog?.capture("deadlockdle_game_finished", {
            mode,
            date: today,
            result: status,
            attempts: guesses.length,
            max_attempts: maxAttempts,
          });
        }

        const next: DailyGameState = {
          ...prev,
          guesses,
          status,
          hintsRevealed: guesses.length,
        };
        saveState(gameKey, next);

        if (status !== "playing") {
          setTimeout(() => updateStreak(status === "won"), 0);
        }

        return next;
      });
    },
    [gameKey, maxAttempts, isFinished, updateStreak, posthog, mode, today],
  );

  return {
    gameState,
    streakState,
    attemptsLeft,
    isFinished,
    submitGuess,
    today,
  };
}
