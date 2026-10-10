import {
  dayNumberSince,
  getModeSeed,
  getTodayDate,
  isPlayableDate,
  seededRandom,
  seededShuffle,
} from "~/lib/daily-seed";

// Which clips a day plays. The video pipeline schedules every video for its own day (`play_date`, three a day), so a
// day plays the videos scheduled for it, in an order shuffled by the same seeded random as Deadlockdle. Every player
// gets the same three. A day the schedule left short is topped up from days already played, so it is never empty
// while any video exists.

/** The first day of Guess the Rank, day 1; archive days go back to it. */
export const GUESS_THE_RANK_EPOCH = "2026-10-10";

/** Clips per day. A smaller pool plays fewer. */
export const ROUNDS_PER_DAY = 3;

/** The seed's mode name: the same date gives Deadlockdle's modes and this game different draws. */
const SEED_MODE = "guess-the-rank";
/** The seed of the top-up draw, apart from the round order's. */
const TOP_UP_SEED_MODE = "guess-the-rank:top-up";

/**
 * Days whose round order is fixed by hand. The launch day was played under the earlier rule (a draw from every
 * uploaded video) before the schedule existed; its rounds keep that order, so nobody mid-game sees them swap.
 */
const PINNED_ROUND_ORDER: Readonly<Record<string, readonly string[]>> = {
  "2026-10-10": ["0c295560cc03a777", "703749758aa6c30f", "bd563e614e11d186"],
};

/** Where the bucket's objects are served publicly. */
export const VIDEO_ORIGIN = "https://guess-the-rank.deadlock-api.com";

/** The R2 prefix the pipeline uploads videos under. */
export const VIDEO_PREFIX = "videos/";

/** A row of the `videos` table, as the daily selection reads it. */
export interface VideoRow {
  id: string;
  r2_key: string;
  poster_key: string | null;
  badge: number;
  duration_s: number;
  active: number;
  /** The UTC day the video is scheduled for (YYYY-MM-DD); null until scheduled. */
  play_date: string | null;
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

const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** The day's videos in round order: by id, shuffled by the day's seed (or a pinned order). */
export function roundOrder<T extends { id: string }>(videos: readonly T[], date: string): T[] {
  const sorted = videos.toSorted(byId);
  const pinned = PINNED_ROUND_ORDER[date];
  if (pinned) {
    const rank = (video: T) => {
      const i = pinned.indexOf(video.id);
      return i === -1 ? pinned.length : i;
    };
    return sorted.toSorted((a, b) => rank(a) - rank(b));
  }
  return seededShuffle(sorted, seededRandom(getModeSeed(date, SEED_MODE)));
}

/**
 * The videos `date` plays, in round order: the active videos scheduled for it whose object is in the bucket. A day
 * with fewer than `ROUNDS_PER_DAY` (the schedule ran out, a video was withdrawn) is topped up with a seeded draw from
 * days already played; a later day's videos are never shown early.
 */
export function selectDailyVideos(
  rows: readonly VideoRow[],
  keysInBucket: ReadonlySet<string>,
  date: string,
): VideoRow[] {
  const playable = rows.filter((row) => row.active === 1 && row.play_date != null && keysInBucket.has(row.r2_key));
  const scheduled = playable
    .filter((row) => row.play_date === date)
    .toSorted(byId)
    .slice(0, ROUNDS_PER_DAY);
  const missing = ROUNDS_PER_DAY - scheduled.length;
  const topUp =
    missing > 0
      ? seededShuffle(
          playable.filter((row) => row.play_date != null && row.play_date < date).toSorted(byId),
          seededRandom(getModeSeed(date, TOP_UP_SEED_MODE)),
        ).slice(0, missing)
      : [];
  return roundOrder([...scheduled, ...topUp], date);
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
