import type { PlayerMatchHistoryEntry } from "deadlock_api_client";

import type { Mode } from "~/components/selectors/ModeSelector";
import { day } from "~/dayjs";

export const MATCH_MODE_LABELS_BY_ID: Record<number, string> = {
  1: "Unranked",
  2: "Private Lobby",
  3: "Co-op Bot",
  4: "Ranked",
  5: "Server Test",
  6: "Tutorial",
  7: "Hero Labs",
};

const GAME_MODE_NORMAL = 1;
const GAME_MODE_STREET_BRAWL = 4;
const MATCH_MODE_UNRANKED = 1;
const MATCH_MODE_RANKED = 4;

/** `match_result` carries the winning team, mirroring the API's own `won()`. */
export function isWin(entry: PlayerMatchHistoryEntry): boolean {
  return entry.match_result === entry.player_team;
}

export function isLoss(entry: PlayerMatchHistoryEntry): boolean {
  return !isWin(entry);
}

export type ResultFilter = "all" | "win" | "loss";

export interface TrackerFilterValues {
  mode: Mode;
  heroId: number | null;
  minUnixTimestamp?: number | null;
  maxUnixTimestamp?: number | null;
  result: ResultFilter;
}

function matchesMode(entry: PlayerMatchHistoryEntry, mode: Mode): boolean {
  switch (mode) {
    case "normal_all":
      return (
        entry.game_mode === GAME_MODE_NORMAL &&
        (entry.match_mode === MATCH_MODE_UNRANKED || entry.match_mode === MATCH_MODE_RANKED)
      );
    case "normal_ranked":
      return entry.game_mode === GAME_MODE_NORMAL && entry.match_mode === MATCH_MODE_RANKED;
    case "normal_unranked":
      return entry.game_mode === GAME_MODE_NORMAL && entry.match_mode === MATCH_MODE_UNRANKED;
    case "street_brawl":
      return entry.game_mode === GAME_MODE_STREET_BRAWL;
  }
}

/** Returns the matching entries sorted newest first. */
export function filterMatches(
  entries: PlayerMatchHistoryEntry[],
  filters: TrackerFilterValues,
): PlayerMatchHistoryEntry[] {
  return entries
    .filter((entry) => {
      if (!matchesMode(entry, filters.mode)) return false;
      if (filters.heroId != null && entry.hero_id !== filters.heroId) return false;
      if (filters.minUnixTimestamp != null && entry.start_time < filters.minUnixTimestamp) return false;
      if (filters.maxUnixTimestamp != null && entry.start_time > filters.maxUnixTimestamp) return false;
      if (filters.result === "win" && !isWin(entry)) return false;
      if (filters.result === "loss" && !isLoss(entry)) return false;
      return true;
    })
    .sort((a, b) => b.start_time - a.start_time);
}

export interface TrackerSummary {
  matches: number;
  wins: number;
  losses: number;
  winrate: number;
  kdaRatio: number;
  avgKills: number;
  avgDeaths: number;
  avgAssists: number;
  soulsPerMin: number;
  lastHitsPerMin: number;
  avgDurationS: number;
  totalTimeS: number;
  lastPlayedUnix: number | null;
}

export function summarize(entries: PlayerMatchHistoryEntry[]): TrackerSummary {
  let wins = 0;
  let losses = 0;
  let kills = 0;
  let deaths = 0;
  let assists = 0;
  let souls = 0;
  let lastHits = 0;
  let totalTimeS = 0;
  let lastPlayedUnix: number | null = null;
  for (const entry of entries) {
    if (isWin(entry)) wins++;
    else if (isLoss(entry)) losses++;
    kills += entry.player_kills;
    deaths += entry.player_deaths;
    assists += entry.player_assists;
    souls += entry.net_worth;
    lastHits += entry.last_hits;
    totalTimeS += entry.match_duration_s;
    if (lastPlayedUnix === null || entry.start_time > lastPlayedUnix) lastPlayedUnix = entry.start_time;
  }
  const matches = entries.length;
  const scored = wins + losses;
  const minutes = totalTimeS / 60;
  return {
    matches,
    wins,
    losses,
    winrate: scored > 0 ? wins / scored : 0,
    kdaRatio: deaths > 0 ? (kills + assists) / deaths : kills + assists,
    avgKills: matches > 0 ? kills / matches : 0,
    avgDeaths: matches > 0 ? deaths / matches : 0,
    avgAssists: matches > 0 ? assists / matches : 0,
    soulsPerMin: minutes > 0 ? souls / minutes : 0,
    lastHitsPerMin: minutes > 0 ? lastHits / minutes : 0,
    avgDurationS: matches > 0 ? totalTimeS / matches : 0,
    totalTimeS,
    lastPlayedUnix,
  };
}

export interface TrackerHeroRow {
  heroId: number;
  matches: number;
  wins: number;
  losses: number;
  winrate: number;
  kdaRatio: number;
  avgKills: number;
  avgDeaths: number;
  avgAssists: number;
  soulsPerMin: number;
  lastPlayedUnix: number;
}

export function perHeroRows(entries: PlayerMatchHistoryEntry[]): TrackerHeroRow[] {
  const byHero = new Map<number, PlayerMatchHistoryEntry[]>();
  for (const entry of entries) {
    const list = byHero.get(entry.hero_id);
    if (list) list.push(entry);
    else byHero.set(entry.hero_id, [entry]);
  }
  const rows: TrackerHeroRow[] = [];
  for (const [heroId, heroEntries] of byHero) {
    const s = summarize(heroEntries);
    rows.push({
      heroId,
      matches: s.matches,
      wins: s.wins,
      losses: s.losses,
      winrate: s.winrate,
      kdaRatio: s.kdaRatio,
      avgKills: s.avgKills,
      avgDeaths: s.avgDeaths,
      avgAssists: s.avgAssists,
      soulsPerMin: s.soulsPerMin,
      lastPlayedUnix: s.lastPlayedUnix ?? 0,
    });
  }
  return rows.sort((a, b) => b.matches - a.matches);
}

/** Win/loss sequence of the most recent scored matches, newest first. */
export function recentForm(entries: PlayerMatchHistoryEntry[], count: number): ("win" | "loss")[] {
  return entries.slice(0, count).map((entry) => (isWin(entry) ? "win" : "loss"));
}

export interface StreakInfo {
  /** Positive = ongoing win streak, negative = ongoing loss streak. */
  current: number;
  longestWin: number;
  longestLoss: number;
}

export function computeStreaks(entries: PlayerMatchHistoryEntry[]): StreakInfo {
  let current = 0;
  for (const entry of entries) {
    const win = isWin(entry);
    if (current === 0) current = win ? 1 : -1;
    else if (current > 0 && win) current++;
    else if (current < 0 && !win) current--;
    else break;
  }
  let longestWin = 0;
  let longestLoss = 0;
  let run = 0;
  let runIsWin = false;
  for (let i = entries.length - 1; i >= 0; i--) {
    const win = isWin(entries[i]);
    if (run > 0 && win === runIsWin) run++;
    else {
      run = 1;
      runIsWin = win;
    }
    if (runIsWin) longestWin = Math.max(longestWin, run);
    else longestLoss = Math.max(longestLoss, run);
  }
  return { current, longestWin, longestLoss };
}

/** Maps a badge (`tier * 10 + subtier`) onto a linear scale so charts can plot rank progression. */
export function badgeToLinear(badge: number): number {
  const tier = Math.floor(badge / 10);
  const subtier = badge % 10;
  if (tier < 1) return 0;
  return (tier - 1) * 6 + subtier;
}

export function linearToBadge(linear: number): number {
  if (linear <= 0) return 0;
  const tier = Math.floor((linear - 1) / 6) + 1;
  const subtier = ((linear - 1) % 6) + 1;
  return tier * 10 + subtier;
}

export interface RankHistoryPoint {
  time: number;
  badge: number;
  linear: number;
  delta: number | null;
}

/** Ranked badge progression, oldest first. Ignores the mode filter's unranked entries by nature. */
export function rankHistoryPoints(entries: PlayerMatchHistoryEntry[]): RankHistoryPoint[] {
  return entries
    .filter((entry) => entry.ranked_display_badge != null && entry.ranked_display_badge > 0)
    .map((entry) => ({
      time: entry.start_time,
      badge: entry.ranked_display_badge as number,
      linear: badgeToLinear(entry.ranked_display_badge as number),
      delta: entry.ranked_delta ?? null,
    }))
    .sort((a, b) => a.time - b.time);
}

export type ActivityGranularity = "week" | "month";

export interface ActivityBucket {
  bucketStartUnix: number;
  wins: number;
  losses: number;
  other: number;
}

export interface Activity {
  granularity: ActivityGranularity;
  buckets: ActivityBucket[];
}

const MAX_WEEK_BUCKETS = 30;

/**
 * Buckets matches per week, or per month once the span between the first and last match would
 * exceed the number of week-sized bars a chart can render legibly. Empty buckets between the
 * first and last match are filled in, so the timeline is continuous but cropped to the range
 * that actually has matches.
 */
export function computeActivity(entries: PlayerMatchHistoryEntry[]): Activity {
  if (entries.length === 0) return { granularity: "week", buckets: [] };
  let minTime = Number.POSITIVE_INFINITY;
  let maxTime = Number.NEGATIVE_INFINITY;
  for (const entry of entries) {
    minTime = Math.min(minTime, entry.start_time);
    maxTime = Math.max(maxTime, entry.start_time);
  }
  const spanWeeks = (maxTime - minTime) / (7 * 24 * 3600);
  const granularity: ActivityGranularity = spanWeeks > MAX_WEEK_BUCKETS ? "month" : "week";

  const buckets = new Map<number, ActivityBucket>();
  let cursor = day.unix(minTime).startOf(granularity);
  const last = day.unix(maxTime).startOf(granularity);
  while (cursor.unix() <= last.unix()) {
    buckets.set(cursor.unix(), { bucketStartUnix: cursor.unix(), wins: 0, losses: 0, other: 0 });
    cursor = cursor.add(1, granularity);
  }
  for (const entry of entries) {
    const bucket = buckets.get(day.unix(entry.start_time).startOf(granularity).unix());
    if (!bucket) continue;
    if (isWin(entry)) bucket.wins++;
    else if (isLoss(entry)) bucket.losses++;
    else bucket.other++;
  }
  return {
    granularity,
    buckets: Array.from(buckets.values()).sort((a, b) => a.bucketStartUnix - b.bucketStartUnix),
  };
}

export function formatMatchDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
