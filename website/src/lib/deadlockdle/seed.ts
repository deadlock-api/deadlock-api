import { dayNumberSince, getTodayDate, isPlayableDate } from "~/lib/daily-seed";

// The generic seeded helpers moved to ~/lib/daily-seed, shared with Guess the Rank; the modes keep importing them here.
export { getModeSeed, getTodayDate, seededPick, seededRandom, seededShuffle } from "~/lib/daily-seed";

/** First Deadlockdle puzzle, i.e. day 1 */
export const EPOCH_DATE = "2026-03-22";

/** Day number since epoch (for share text "Deadlockdle #N") */
export function getDayNumber(date: string): number {
  return dayNumberSince(EPOCH_DATE, date);
}

/** A playable puzzle day: from the epoch up to today. ISO dates compare lexicographically. */
export function isValidPuzzleDate(date: string): boolean {
  return isPlayableDate(date, EPOCH_DATE);
}

/** A `?date=` search param, falling back to today when absent or out of range */
export function resolvePuzzleDate(date: string | undefined): string {
  return date != null && isValidPuzzleDate(date) ? date : getTodayDate();
}

export interface PuzzleDateSearch {
  date?: string;
}

/** Route `?date=` validator; an absent or out-of-range date falls back to today */
export function validatePuzzleDateSearch(search: Record<string, unknown>): PuzzleDateSearch {
  return typeof search.date === "string" && isValidPuzzleDate(search.date) ? { date: search.date } : {};
}

/** The link a shared result carries: today's hub, or the archive of the day the result is from. */
export function puzzleShareUrl(date: string): string {
  const hub = "https://deadlock-api.com/games/deadlockdle";
  return date === getTodayDate() ? hub : `${hub}?date=${date}`;
}
