import { getTodayDate } from "./seed";
import type { GameMode } from "./types";

/** Today keeps the unsuffixed key so games in progress survive; past days get their own slot */
export function gameStorageKey(mode: GameMode, date: string): string {
  return date === getTodayDate() ? `deadlockdle:${mode}:game` : `deadlockdle:${mode}:game:${date}`;
}
