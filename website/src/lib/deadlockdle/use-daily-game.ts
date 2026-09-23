import { useCallback } from "react";

import { day } from "~/dayjs";

import { getTodayDate, resolvePuzzleDate } from "./seed";
import { gameStorageKey } from "./storage";
import type { DailyGameState, GameMode, GameStatus, StreakState } from "./types";
import { useStoredDailyState, useStoredState } from "./use-stored-state";

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

function freshGameState(date: string): DailyGameState {
  return { ...DEFAULT_GAME_STATE, date };
}

function freshStreakState(): StreakState {
  return DEFAULT_STREAK_STATE;
}

function dayDiff(a: string, b: string): number {
  return day(b).diff(day(a), "day");
}

export function useDailyGame(mode: GameMode, maxAttempts: number, date?: string) {
  const puzzleDate = resolvePuzzleDate(date);
  const isArchive = puzzleDate !== getTodayDate();
  const gameKey = gameStorageKey(mode, puzzleDate);
  const streakKey = `deadlockdle:${mode}:streak`;

  const [gameState, saveGameState] = useStoredDailyState(gameKey, puzzleDate, freshGameState);
  const [streakState, saveStreak] = useStoredState(streakKey, freshStreakState);

  const attemptsLeft = maxAttempts - gameState.guesses.length;
  const isFinished = gameState.status !== "playing";

  const submitGuess = useCallback(
    (guess: string, correct: boolean) => {
      if (isFinished || gameState.guesses.includes(guess)) return;
      const guesses = [...gameState.guesses, guess];
      let status: GameStatus = "playing";
      if (correct) {
        status = "won";
      } else if (guesses.length >= maxAttempts) {
        status = "lost";
      }
      saveGameState({ ...gameState, guesses, status, hintsRevealed: guesses.length });

      // Once per puzzle day: a second tab or a replayed finish must not count the same day twice.
      if (status === "playing" || isArchive || streakState.lastPlayedDate === puzzleDate) return;
      const won = status === "won";
      const isConsecutive = streakState.lastPlayedDate === "" || dayDiff(streakState.lastPlayedDate, puzzleDate) === 1;
      const currentStreak = won ? (isConsecutive ? streakState.currentStreak + 1 : 1) : 0;
      saveStreak({
        currentStreak,
        maxStreak: Math.max(streakState.maxStreak, currentStreak),
        lastPlayedDate: puzzleDate,
        gamesPlayed: streakState.gamesPlayed + 1,
        gamesWon: streakState.gamesWon + (won ? 1 : 0),
      });
    },
    [gameState, streakState, isFinished, isArchive, maxAttempts, puzzleDate, saveGameState, saveStreak],
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
