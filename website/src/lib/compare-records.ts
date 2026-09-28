import type { PlayerMatchHistoryEntry } from "deadlock_api_client";

import { computeStreaks, isWin, soulsPerMinute } from "~/lib/tracker/compute";

/** A single match that holds a record: its value and the match, so the record can link to it. */
export interface RecordMatch {
  value: number;
  matchId: number;
  heroId: number;
  startTime: number;
}

/** One player's records over a match history: bests of a single match, streaks and days played. */
export interface PlayerRecords {
  matches: number;
  mostKills: RecordMatch | null;
  mostAssists: RecordMatch | null;
  mostSouls: RecordMatch | null;
  bestSoulsPerMin: RecordMatch | null;
  mostLastHits: RecordMatch | null;
  longestWinStreak: number;
  /** Positive = an ongoing win streak, negative = an ongoing loss streak, 0 without matches. */
  currentStreak: number;
  /** Distinct UTC days with at least one match. */
  activeDays: number;
}

/** Matches shorter than this are left out of the per-minute record: an early abandon inflates it. */
export const RECORD_MIN_DURATION_S = 15 * 60;

function best(
  entries: readonly PlayerMatchHistoryEntry[],
  value: (entry: PlayerMatchHistoryEntry) => number,
  include: (entry: PlayerMatchHistoryEntry) => boolean = () => true,
): RecordMatch | null {
  let top: RecordMatch | null = null;
  for (const entry of entries) {
    if (!include(entry)) continue;
    const v = value(entry);
    // Ties keep the earlier match: it set the record first.
    if (top === null || v > top.value || (v === top.value && entry.start_time < top.startTime)) {
      top = { value: v, matchId: entry.match_id, heroId: entry.hero_id, startTime: entry.start_time };
    }
  }
  return top;
}

/** A match history (newest first, as the API and `filterMatches` give it) as records. */
export function playerRecords(entries: readonly PlayerMatchHistoryEntry[]): PlayerRecords {
  const streaks = computeStreaks(entries as PlayerMatchHistoryEntry[]);
  const days = new Set<number>();
  for (const entry of entries) days.add(Math.floor(entry.start_time / 86_400));
  return {
    matches: entries.length,
    mostKills: best(entries, (entry) => entry.player_kills),
    mostAssists: best(entries, (entry) => entry.player_assists),
    mostSouls: best(entries, (entry) => entry.net_worth),
    bestSoulsPerMin: best(entries, soulsPerMinute, (entry) => entry.match_duration_s >= RECORD_MIN_DURATION_S),
    mostLastHits: best(entries, (entry) => entry.last_hits),
    longestWinStreak: streaks.longestWin,
    currentStreak: streaks.current,
    activeDays: days.size,
  };
}

/** Match length brackets, in minutes: [from, to). The last is open-ended. */
export const DURATION_BRACKETS = [
  { key: "short", label: "< 25 min", from: 0, to: 25 },
  { key: "mid", label: "25–35 min", from: 25, to: 35 },
  { key: "long", label: "35–45 min", from: 35, to: 45 },
  { key: "veryLong", label: "45+ min", from: 45, to: Infinity },
] as const;
export type DurationBracket = (typeof DURATION_BRACKETS)[number]["key"];

/** Fewer matches than this in a bracket and its win rate is left out: a coin flip or two says nothing. */
export const MIN_BRACKET_MATCHES = 5;

export interface BracketResult {
  bracket: DurationBracket;
  matches: number;
  wins: number;
  /** Null under `MIN_BRACKET_MATCHES`. */
  winRate: number | null;
}

/** A player's win rate by match length: do they close games early or scale into late ones? */
export function winRateByDuration(
  entries: readonly PlayerMatchHistoryEntry[],
  minMatches = MIN_BRACKET_MATCHES,
): BracketResult[] {
  const totals = DURATION_BRACKETS.map(() => ({ matches: 0, wins: 0 }));
  for (const entry of entries) {
    const minutes = entry.match_duration_s / 60;
    const index = DURATION_BRACKETS.findIndex((bracket) => minutes >= bracket.from && minutes < bracket.to);
    if (index < 0) continue;
    totals[index].matches++;
    if (isWin(entry)) totals[index].wins++;
  }
  return DURATION_BRACKETS.map((bracket, index) => {
    const { matches, wins } = totals[index];
    return { bracket: bracket.key, matches, wins, winRate: matches >= minMatches ? wins / matches : null };
  });
}

export interface HourBucket {
  hour: number;
  matches: number;
  wins: number;
}

/**
 * A match history by the hour of day each match started, 0 to 23. `hourOf` maps a unix start time to its hour: the
 * viewer's local clock in the browser, UTC where the server renders.
 */
export function matchesByHour(
  entries: readonly PlayerMatchHistoryEntry[],
  hourOf: (unix: number) => number = (unix) => Math.floor((unix % 86_400) / 3600),
): HourBucket[] {
  const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, matches: 0, wins: 0 }));
  for (const entry of entries) {
    const bucket = hours[hourOf(entry.start_time)];
    if (!bucket) continue;
    bucket.matches++;
    if (isWin(entry)) bucket.wins++;
  }
  return hours;
}

export interface WeekdayBucket {
  /** 0 Monday … 6 Sunday. */
  weekday: number;
  matches: number;
  wins: number;
}

/** A match history by the weekday each match started, Monday first; `weekdayOf` returns 0 for Monday. */
export function matchesByWeekday(
  entries: readonly PlayerMatchHistoryEntry[],
  // The unix epoch fell on a Thursday (3 with Monday as 0).
  weekdayOf: (unix: number) => number = (unix) => (Math.floor(unix / 86_400) + 3) % 7,
): WeekdayBucket[] {
  const days = Array.from({ length: 7 }, (_, weekday) => ({ weekday, matches: 0, wins: 0 }));
  for (const entry of entries) {
    const bucket = days[weekdayOf(entry.start_time)];
    if (!bucket) continue;
    bucket.matches++;
    if (isWin(entry)) bucket.wins++;
  }
  return days;
}
