import { day } from "~/dayjs";
import { readLocalStorage } from "~/lib/local-storage";

import { getTodayDate } from "./seed";
import type { GameMode, StreakState } from "./types";

/** Every puzzle day has its own slot, so a day finished as "today" still reads as finished once it is in the past. */
export function gameStorageKey(mode: GameMode, date: string): string {
  return `deadlockdle:${mode}:game:${date}`;
}

/**
 * Where today's game used to live, without a date. It moved at midnight from "today" to the past, where nothing looked
 * for it; it is still read, for the one day it records, so games saved before the switch are kept.
 */
export function legacyGameStorageKey(mode: GameMode): string {
  return `deadlockdle:${mode}:game`;
}

/** A day's saved game as parsed JSON, from its own slot or the legacy one; null when that day was never played. */
export function readStoredGame(mode: GameMode, date: string): Record<string, unknown> | null {
  for (const key of [gameStorageKey(mode, date), legacyGameStorageKey(mode)]) {
    const raw = readLocalStorage(key);
    if (!raw) continue;
    try {
      const state = JSON.parse(raw) as Record<string, unknown> | null;
      if (state?.date === date) return state;
    } catch {
      // A corrupt slot reads as unplayed.
    }
  }
  return null;
}

/** A guess mode's streak record, across days (the quizzes keep none). */
export function streakStorageKey(mode: GameMode): string {
  return `deadlockdle:${mode}:streak`;
}

/**
 * The streak the player still holds on `today`: the saved count only survives while its last finished day is today or
 * yesterday. A missed day breaks it, but storage only learns that the next time the mode is finished.
 */
export function liveStreak(state: Partial<StreakState> | null, today: string): number {
  const count = state?.currentStreak;
  const last = state?.lastPlayedDate;
  if (typeof count !== "number" || count <= 0 || typeof last !== "string") return 0;
  const yesterday = day(today).subtract(1, "day").format("YYYY-MM-DD");
  return last === today || last === yesterday ? count : 0;
}

/** The mode's live streak from storage; 0 during SSR, for modes without one and when storage is unreadable. */
export function readCurrentStreak(mode: GameMode, today: string = getTodayDate()): number {
  const raw = readLocalStorage(streakStorageKey(mode));
  if (!raw) return 0;
  try {
    return liveStreak(JSON.parse(raw) as Partial<StreakState> | null, today);
  } catch {
    return 0;
  }
}
