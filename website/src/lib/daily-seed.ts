import { day } from "~/dayjs";

// The seeded randomness behind every daily game (Deadlockdle, Guess the Rank): the same date and mode give every
// player the same puzzle, in every timezone.

/** Deterministic hash from date string */
function getDailySeed(date: string): number {
  let hash = 0;
  for (const char of date) {
    hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  }
  return Math.abs(hash);
}

/** Mulberry32 PRNG — returns a function that produces deterministic floats [0, 1) */
export function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pick one item from array using seeded random */
export function seededPick<T>(arr: readonly T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

/** Shuffle array in-place using Fisher-Yates with seeded random */
export function seededShuffle<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Today's date as YYYY-MM-DD in UTC (same puzzle for all timezones) */
export function getTodayDate(): string {
  return day.utc().format("YYYY-MM-DD");
}

/** Mode-specific seed to prevent collision across game modes */
export function getModeSeed(date: string, mode: string): number {
  return getDailySeed(`${date}:${mode}`);
}

/** Day number of `date` counted from a game's first day, which is day 1 (for share texts such as "#N"). */
export function dayNumberSince(epoch: string, date: string): number {
  return day(date).diff(day(epoch), "day") + 1;
}

/** A playable day of a game that started on `epoch`: from the epoch up to today. ISO dates compare lexicographically. */
export function isPlayableDate(date: string, epoch: string): boolean {
  // A round trip, not isValid(): dayjs rolls 2026-04-31 over to May 1, which would give a second puzzle for "Day 41".
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    day.utc(date).format("YYYY-MM-DD") === date &&
    date >= epoch &&
    date <= getTodayDate()
  );
}
