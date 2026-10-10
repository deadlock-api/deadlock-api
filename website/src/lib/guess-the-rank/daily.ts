import {
  dayNumberSince,
  getModeSeed,
  getTodayDate,
  isPlayableDate,
  seededRandom,
  seededShuffle,
} from "~/lib/daily-seed";

// Which clips a day plays. Every player gets the same three: the day's pool, in a fixed order, shuffled by the same
// seeded random as Deadlockdle.

/** The first day of Guess the Rank, day 1; archive days go back to it. */
export const GUESS_THE_RANK_EPOCH = "2026-10-10";

/** Clips per day. A smaller pool plays fewer. */
export const ROUNDS_PER_DAY = 3;

/** The seed's mode name: the same date gives Deadlockdle's modes and this game different draws. */
const SEED_MODE = "guess-the-rank";

/** Where the bucket's objects are served publicly. */
export const VIDEO_ORIGIN = "https://guess-the-rank.deadlock-api.com";

/** The R2 prefix the pipeline uploads videos under. */
export const VIDEO_PREFIX = "videos/";

/** A row of the `videos` table, as the pool reads it. */
export interface VideoRow {
  id: string;
  r2_key: string;
  poster_key: string | null;
  badge: number;
  duration_s: number;
  added_at: string;
  active: number;
}

/** One round as the browser gets it: the clip, never its rank. */
export interface DailyRound {
  round: number;
  videoId: string;
  videoUrl: string;
  posterUrl: string | null;
  durationS: number;
}

/** The public URL of an object in the bucket. */
export function objectUrl(key: string): string {
  return `${VIDEO_ORIGIN}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

/**
 * The videos a day draws from: active rows added before that day began (UTC), so an upload during the day never
 * changes today's rounds, whose video is in the bucket (a row whose upload failed or was removed never plays), by id.
 */
export function dailyPool(rows: readonly VideoRow[], keysInBucket: ReadonlySet<string>, date: string): VideoRow[] {
  const dayStart = Date.parse(`${date}T00:00:00Z`);
  return rows
    .filter((row) => {
      const added = Date.parse(row.added_at);
      return row.active === 1 && Number.isFinite(added) && added < dayStart && keysInBucket.has(row.r2_key);
    })
    .toSorted((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** The day's videos in round order: the pool shuffled by the day's seed, the first `ROUNDS_PER_DAY`. */
export function pickDailyVideos<T>(pool: readonly T[], date: string): T[] {
  return seededShuffle([...pool], seededRandom(getModeSeed(date, SEED_MODE))).slice(0, ROUNDS_PER_DAY);
}

/** The browser's view of the day's videos. */
export function toDailyRounds(videos: readonly VideoRow[]): DailyRound[] {
  return videos.map((video, round) => ({
    round,
    videoId: video.id,
    videoUrl: objectUrl(video.r2_key),
    posterUrl: video.poster_key ? objectUrl(video.poster_key) : null,
    durationS: video.duration_s,
  }));
}

/** A playable day: from the first day up to today. */
export function isValidGuessDate(date: string): boolean {
  return isPlayableDate(date, GUESS_THE_RANK_EPOCH);
}

/** A `?date=` search param, falling back to today when absent or out of range. */
export function resolveGuessDate(date: string | undefined): string {
  return date != null && isValidGuessDate(date) ? date : getTodayDate();
}

/** Route `?date=` validator; an absent or out-of-range date falls back to today. */
export function validateGuessDateSearch(search: Record<string, unknown>): { date?: string } {
  return typeof search.date === "string" && isValidGuessDate(search.date) ? { date: search.date } : {};
}

/** "Guess the Rank #N". */
export function guessDayNumber(date: string): number {
  return dayNumberSince(GUESS_THE_RANK_EPOCH, date);
}

/** The link a shared result carries: today's game, or the archive day it is from. */
export function guessShareUrl(date: string): string {
  const page = "https://deadlock-api.com/games/guess-the-rank";
  return date === getTodayDate() ? page : `${page}?date=${date}`;
}
