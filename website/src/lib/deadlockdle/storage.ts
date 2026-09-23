import { readLocalStorage } from "~/lib/local-storage";

import type { GameMode } from "./types";

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
