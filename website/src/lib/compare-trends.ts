import type { PlayerMatchHistoryEntry } from "deadlock_api_client";

import { isWin } from "~/lib/tracker/compute";

const DAY = 86_400;
const WEEK = 7 * DAY;
/** The unix epoch fell on a Thursday; the first Monday after it is four days later. */
const MONDAY_OFFSET = 4 * DAY;

/** Fewer matches than this in a week and the week is a gap: one or two matches say little about a week. */
export const MIN_WEEK_MATCHES = 3;

export const TREND_METRICS = ["winRate", "kda", "kills", "deaths", "soulsPerMin", "lastHitsPerMin"] as const;
export type TrendMetric = (typeof TREND_METRICS)[number];

/** Start of the UTC week (Monday 00:00 UTC) a moment falls in, in unix seconds. UTC, so server and browser agree. */
export function utcWeek(unix: number): number {
  return Math.floor((unix - MONDAY_OFFSET) / WEEK) * WEEK + MONDAY_OFFSET;
}

/** One player's matches in one UTC week, summed. */
export interface WeekTotals {
  week: number;
  matches: number;
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
  netWorth: number;
  lastHits: number;
  /** Seconds played. */
  seconds: number;
}

/** A match history (any order) summed per UTC week, oldest first. Weeks without matches are left out. */
export function weeklyTotals(entries: readonly PlayerMatchHistoryEntry[]): WeekTotals[] {
  const byWeek = new Map<number, WeekTotals>();
  for (const entry of entries) {
    const week = utcWeek(entry.start_time);
    let totals = byWeek.get(week);
    if (!totals) {
      totals = { week, matches: 0, wins: 0, kills: 0, deaths: 0, assists: 0, netWorth: 0, lastHits: 0, seconds: 0 };
      byWeek.set(week, totals);
    }
    totals.matches++;
    if (isWin(entry)) totals.wins++;
    totals.kills += entry.player_kills;
    totals.deaths += entry.player_deaths;
    totals.assists += entry.player_assists;
    totals.netWorth += entry.net_worth;
    totals.lastHits += entry.last_hits;
    totals.seconds += Math.max(0, entry.match_duration_s);
  }
  return [...byWeek.values()].sort((a, b) => a.week - b.week);
}

/**
 * A week's value of a metric, pooled over its matches: KDA is the week's kills plus assists over its deaths (kills
 * plus assists without deaths), the per-minute rates are the week's totals over its minutes. Null where it has no
 * value (no minutes played).
 */
export function weekValue(totals: WeekTotals, metric: TrendMetric): number | null {
  if (totals.matches === 0) return null;
  switch (metric) {
    case "winRate":
      return totals.wins / totals.matches;
    case "kda":
      return (totals.kills + totals.assists) / Math.max(1, totals.deaths);
    case "kills":
      return totals.kills / totals.matches;
    case "deaths":
      return totals.deaths / totals.matches;
    case "soulsPerMin":
      return totals.seconds > 0 ? (totals.netWorth * 60) / totals.seconds : null;
    case "lastHitsPerMin":
      return totals.seconds > 0 ? (totals.lastHits * 60) / totals.seconds : null;
  }
}

export interface TrendSeriesInput {
  key: string;
  weeks: readonly WeekTotals[];
}

export interface TrendRow {
  week: number;
  /** What each series plots this week: null for a gap (fewer than the minimum matches, or none). */
  value: Record<string, number | null>;
  /** Each series' matches this week, gap or not. */
  matches: Record<string, number>;
  /** A plotted week with no plotted neighbour, which the chart draws as a dot so it is not invisible. */
  lone: Record<string, boolean>;
}

/**
 * The chart's rows: every UTC week from the first to the last week in which any series has a value, so a missing week
 * breaks the lines rather than joining across it. Empty when no series has a week with enough matches.
 */
export function mergeWeeklyTrend(
  series: readonly TrendSeriesInput[],
  metric: TrendMetric,
  minMatches = MIN_WEEK_MATCHES,
): TrendRow[] {
  const valued = series.map(({ key, weeks }) => {
    const byWeek = new Map<number, { value: number | null; matches: number }>();
    for (const totals of weeks) {
      byWeek.set(totals.week, {
        value: totals.matches >= minMatches ? weekValue(totals, metric) : null,
        matches: totals.matches,
      });
    }
    return { key, byWeek };
  });
  let first = Infinity;
  let last = -Infinity;
  for (const { byWeek } of valued) {
    for (const [week, { value }] of byWeek) {
      if (value == null) continue;
      first = Math.min(first, week);
      last = Math.max(last, week);
    }
  }
  if (first > last) return [];

  const rows: TrendRow[] = [];
  for (let week = first; week <= last; week += WEEK) {
    const row: TrendRow = { week, value: {}, matches: {}, lone: {} };
    for (const { key, byWeek } of valued) {
      const cell = byWeek.get(week);
      row.value[key] = cell?.value ?? null;
      row.matches[key] = cell?.matches ?? 0;
    }
    rows.push(row);
  }
  rows.forEach((row, index) => {
    for (const { key } of valued) {
      row.lone[key] =
        row.value[key] != null && rows[index - 1]?.value[key] == null && rows[index + 1]?.value[key] == null;
    }
  });
  return rows;
}

/** Up to `count` week starts, evenly stepped in whole weeks, from `start` to `end`. */
export function weekTicks(start: number, end: number, count = 5): number[] {
  if (end <= start) return [start];
  const step = Math.max(1, Math.round((end - start) / WEEK / (count - 1))) * WEEK;
  const ticks: number[] = [];
  for (let t = start; t <= end; t += step) ticks.push(t);
  return ticks;
}
