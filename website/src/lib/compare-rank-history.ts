import type { PlayerMatchHistoryEntry } from "deadlock_api_client";

import { badgeToLinear, rankHistoryPoints } from "~/lib/tracker/compute";

const DAY = 86_400;

/** Longer than this between two ranked days and the line breaks: the rank in between was never observed. */
export const RANK_GAP_DAYS = 14;

/** Where a match history places a player on one UTC day: the rank after their last ranked match of that day. */
export interface DailyRank {
  /** Start of the UTC day, in unix seconds. UTC, so the server and the browser bucket the same way. */
  day: number;
  badge: number;
  linear: number;
}

export function utcDay(unix: number): number {
  return Math.floor(unix / DAY) * DAY;
}

/**
 * A match history (any order) down-sampled to one rank per UTC day, oldest first: a 9,000-match history becomes a
 * few hundred points and a day of rank swings reads as where it ended.
 */
export function dailyRanks(entries: readonly PlayerMatchHistoryEntry[]): DailyRank[] {
  const byDay = new Map<number, DailyRank>();
  // Oldest first, so the last write for a day is the day's last match.
  for (const point of rankHistoryPoints([...entries])) {
    const day = utcDay(point.time);
    byDay.set(day, { day, badge: point.badge, linear: point.linear });
  }
  return [...byDay.values()];
}

export interface RankSeriesInput {
  key: string;
  days: readonly DailyRank[];
}

export interface RankRow {
  day: number;
  /** What each series plots on this day: null where its line breaks (before, after or inside a long absence). */
  linear: Record<string, number | null>;
  /** Each series' badge as of this day, carried from its last ranked day; null before its first. */
  badge: Record<string, number | null>;
  /** Whether the series played a ranked match on this day. */
  played: Record<string, boolean>;
  /** A ranked day with no neighbour on its line, which the chart draws as a dot so it is not invisible. */
  lone: Record<string, boolean>;
}

/**
 * The chart's rows: one per day on which any series has a rank. Between two ranked days of a series at most
 * `gapDays` apart its rank holds (a step line); a longer absence, and the days before its first or after its last
 * ranked day, are gaps: a row the day after each absence starts carries the break.
 */
export function mergeRankSeries(series: readonly RankSeriesInput[], gapDays = RANK_GAP_DAYS): RankRow[] {
  const gap = gapDays * DAY;
  const days = new Set<number>();
  for (const { days: points } of series) {
    points.forEach((point, index) => {
      days.add(point.day);
      // A row the day after a long absence starts, where the line is null, so the plot does not join across it.
      const following = points[index + 1];
      if (following && following.day - point.day > gap) days.add(point.day + DAY);
    });
  }
  const sortedDays = [...days].sort((a, b) => a - b);
  const rows: RankRow[] = sortedDays.map((day) => ({ day, linear: {}, badge: {}, played: {}, lone: {} }));
  for (const { key, days: points } of series) {
    let next = 0;
    for (const row of rows) {
      while (next < points.length && points[next].day < row.day) next++;
      const current = points[next]?.day === row.day ? points[next] : undefined;
      const previous = points[next - 1];
      const following = points[current ? next + 1 : next];
      row.played[key] = current !== undefined;
      row.badge[key] = (current ?? previous)?.badge ?? null;
      if (current) {
        row.linear[key] = current.linear;
        const joinedBefore = previous !== undefined && current.day - previous.day <= gap;
        const joinedAfter = following !== undefined && following.day - current.day <= gap;
        row.lone[key] = !joinedBefore && !joinedAfter;
      } else {
        const bridged = previous !== undefined && following !== undefined && following.day - previous.day <= gap;
        row.linear[key] = bridged ? previous.linear : null;
        row.lone[key] = false;
      }
    }
  }
  return rows;
}

/** The first and last ranked days of every series, or null without any. */
export function rankDayExtent(series: readonly RankSeriesInput[]): [number, number] | null {
  const all = series.flatMap((s) => s.days.map((d) => d.day));
  return all.length ? [Math.min(...all), Math.max(...all)] : null;
}

/**
 * The rank axis: a subtier of padding around the plotted ranks, a tick at the start of every tier inside it, or at
 * every subtier (at most six, then every other) when the ranks sit inside one tier.
 */
export function rankAxis(linears: readonly number[]): { domain: [number, number]; ticks: number[] } {
  if (!linears.length) return { domain: [1, 6], ticks: [1, 6] };
  const lo = Math.max(1, Math.min(...linears) - 1);
  const hi = Math.min(badgeToLinear(116), Math.max(...linears) + 1);
  const tierStarts: number[] = [];
  for (let v = lo; v <= hi; v++) if ((v - 1) % 6 === 0) tierStarts.push(v);
  if (tierStarts.length >= 2) return { domain: [lo, hi], ticks: tierStarts };
  const span = hi - lo;
  const step = span > 6 ? 2 : 1;
  const ticks: number[] = [];
  for (let v = lo; v <= hi; v += step) ticks.push(v);
  return { domain: [lo, hi], ticks };
}

/** About `count` day ticks spread evenly over `[start, end]`, each on a UTC day start. */
export function dayTicks(start: number, end: number, count = 5): number[] {
  const first = utcDay(start);
  const last = utcDay(end);
  if (last <= first) return [first];
  const step = Math.max(1, Math.round((last - first) / DAY / (count - 1))) * DAY;
  const ticks: number[] = [];
  for (let t = first; t <= last; t += step) ticks.push(t);
  return ticks;
}
