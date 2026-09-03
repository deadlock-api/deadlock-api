import { useCallback, useState } from "react";

import { day } from "~/dayjs";

import { getTodayDate, resolvePuzzleDate } from "./seed";
import { gameStorageKey } from "./storage";
import type { DailyGameState, GameMode, GameStatus, StreakState } from "./types";

function loadState<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function saveState<T>(key: string, state: T): void {
  if (typeof window === "undefined") return;
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

function initialGameState(key: string, date: string): DailyGameState {
  const saved = loadState(key, DEFAULT_GAME_STATE);
  if (saved.date !== date) {
    const fresh = { ...DEFAULT_GAME_STATE, date };
    saveState(key, fresh);
    return fresh;
  }
  return saved;
}

function dayDiff(a: string, b: string): number {
  return day(b).diff(day(a), "day");
}

export function useDailyGame(mode: GameMode, maxAttempts: number, date?: string) {
  const puzzleDate = resolvePuzzleDate(date);
  const isArchive = puzzleDate !== getTodayDate();
  const gameKey = gameStorageKey(mode, puzzleDate);
  const streakKey = `deadlockdle:${mode}:streak`;

  const [gameState, setGameState] = useState<DailyGameState>(() => initialGameState(gameKey, puzzleDate));
  const [loadedKey, setLoadedKey] = useState(gameKey);

  if (loadedKey !== gameKey) {
    setLoadedKey(gameKey);
    setGameState(initialGameState(gameKey, puzzleDate));
  }

  const [streakState, setStreakState] = useState<StreakState>(() => loadState(streakKey, DEFAULT_STREAK_STATE));

  const attemptsLeft = maxAttempts - gameState.guesses.length;
  const isFinished = gameState.status !== "playing";

  const updateStreak = useCallback(
    (won: boolean) => {
      setStreakState((prev) => {
        const isConsecutive = prev.lastPlayedDate === "" || dayDiff(prev.lastPlayedDate, puzzleDate) === 1;
        const newStreak = won ? (isConsecutive ? prev.currentStreak + 1 : 1) : 0;
        const next: StreakState = {
          currentStreak: newStreak,
          maxStreak: Math.max(prev.maxStreak, newStreak),
          lastPlayedDate: puzzleDate,
          gamesPlayed: prev.gamesPlayed + 1,
          gamesWon: prev.gamesWon + (won ? 1 : 0),
        };
        saveState(streakKey, next);
        return next;
      });
    },
    [streakKey, puzzleDate],
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

        const next: DailyGameState = {
          ...prev,
          guesses,
          status,
          hintsRevealed: guesses.length,
        };
        saveState(gameKey, next);

        if (status !== "playing" && !isArchive) {
          setTimeout(() => updateStreak(status === "won"), 0);
        }

        return next;
      });
    },
    [gameKey, maxAttempts, isFinished, isArchive, updateStreak],
  );

  return {
    gameState,
    streakState,
    attemptsLeft,
    isFinished,
    submitGuess,
    date: puzzleDate,
    isArchive,
  };
}
