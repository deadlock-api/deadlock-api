import type { PlayerMatchHistoryEntry } from "deadlock_api_client";

import type { Mode } from "~/components/selectors/ModeSelector";
import { day } from "~/dayjs";

const MATCH_MODE_LABELS_BY_ID: Record<number, string> = {
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

/** Street Brawl matches report the lobby type (unranked or private) as their match mode, so the game mode names them. */
export function matchModeLabel(entry: PlayerMatchHistoryEntry): string {
  if (entry.game_mode === GAME_MODE_STREET_BRAWL) return "Street Brawl";
  return MATCH_MODE_LABELS_BY_ID[entry.match_mode] ?? "Unknown";
}

/** `match_result` carries the winning team, mirroring the API's own `won()`. */
export function isWin(entry: PlayerMatchHistoryEntry): boolean {
  return entry.match_result === entry.player_team;
}

export function isLoss(entry: PlayerMatchHistoryEntry): boolean {
  return !isWin(entry);
}

export type UnscoredOutcome = "penalized" | "party_penalized" | "not_scored";

const UNSCORED_OUTCOMES: Record<number, UnscoredOutcome> = {
  3: "penalized",
  4: "party_penalized",
  5: "not_scored",
};

/** Why the match did not count for the player, or null when it was scored as a plain win or loss. */
export function unscoredOutcome(entry: PlayerMatchHistoryEntry): UnscoredOutcome | null {
  return UNSCORED_OUTCOMES[entry.player_match_outcome] ?? null;
}

/** Street Brawl reports lane ids too, but its map has no lanes to speak of. */
export function hasLanes(entry: PlayerMatchHistoryEntry): boolean {
  return entry.game_mode === GAME_MODE_NORMAL;
}

export interface BrawlRounds {
  own: number;
  enemy: number;
}

/** Street Brawl round score from the player's side, or null for other modes. */
export function brawlRounds(entry: PlayerMatchHistoryEntry): BrawlRounds | null {
  if (entry.game_mode !== GAME_MODE_STREET_BRAWL) return null;
  if (entry.brawl_score_team0 == null || entry.brawl_score_team1 == null) return null;
  const scores = [entry.brawl_score_team0, entry.brawl_score_team1];
  return { own: scores[entry.player_team], enemy: scores[1 - entry.player_team] };
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

/** Widest first, so a match hidden by the mode filter comes back under the broadest mode that shows it. */
const REVEAL_MODES: Mode[] = ["normal_all", "street_brawl"];

/**
 * The filters widened just enough to show `entry`: each filter that excludes it falls back to its widest
 * setting (a date range to all time) and the rest stay. Null when no mode shows the entry's game mode.
 */
export function filtersRevealing(
  entry: PlayerMatchHistoryEntry,
  filters: TrackerFilterValues,
): TrackerFilterValues | null {
  const mode = matchesMode(entry, filters.mode) ? filters.mode : REVEAL_MODES.find((m) => matchesMode(entry, m));
  if (!mode) return null;
  const inRange =
    (filters.minUnixTimestamp == null || entry.start_time >= filters.minUnixTimestamp) &&
    (filters.maxUnixTimestamp == null || entry.start_time <= filters.maxUnixTimestamp);
  const resultMatches =
    filters.result === "all" ||
    (filters.result === "win" && isWin(entry)) ||
    (filters.result === "loss" && isLoss(entry));
  return {
    mode,
    heroId: filters.heroId == null || filters.heroId === entry.hero_id ? filters.heroId : null,
    minUnixTimestamp: inRange ? filters.minUnixTimestamp : null,
    maxUnixTimestamp: inRange ? filters.maxUnixTimestamp : null,
    result: resultMatches ? filters.result : "all",
  };
}

export function soulsPerMinute(entry: PlayerMatchHistoryEntry): number {
  return entry.match_duration_s > 0 ? entry.net_worth / (entry.match_duration_s / 60) : 0;
}

export const MATCH_SORT_KEYS = ["kda", "souls", "soulsPerMin", "lastHits", "duration", "rankDelta", "played"] as const;
export type MatchSortKey = (typeof MATCH_SORT_KEYS)[number];
export const SORT_DIRS = ["asc", "desc"] as const;
export type SortDir = (typeof SORT_DIRS)[number];

export function kdaRatio(entry: PlayerMatchHistoryEntry): number {
  return entry.player_deaths > 0
    ? (entry.player_kills + entry.player_assists) / entry.player_deaths
    : entry.player_kills + entry.player_assists;
}

const MATCH_SORT_VALUES: Record<MatchSortKey, (entry: PlayerMatchHistoryEntry) => number> = {
  kda: kdaRatio,
  souls: (entry) => entry.net_worth,
  soulsPerMin: soulsPerMinute,
  lastHits: (entry) => entry.last_hits,
  duration: (entry) => entry.match_duration_s,
  rankDelta: (entry) => entry.ranked_delta ?? 0,
  played: (entry) => entry.start_time,
};

/** The sorted metric spelled out, or null for the keys a match row already shows. */
export function sortValueLabel(entry: PlayerMatchHistoryEntry, key: MatchSortKey): string | null {
  switch (key) {
    case "kda":
      return `${kdaRatio(entry).toFixed(2)} KDA`;
    case "souls":
      return `${entry.net_worth.toLocaleString("en-US")} souls`;
    case "soulsPerMin":
      return `${Math.round(soulsPerMinute(entry)).toLocaleString("en-US")} souls/min`;
    case "lastHits":
      return `${entry.last_hits.toLocaleString("en-US")} last hits`;
    default:
      return null;
  }
}

/** Ties fall back to newest first so the order stays stable across sort keys. */
export function sortMatches(
  entries: PlayerMatchHistoryEntry[],
  key: MatchSortKey,
  dir: SortDir,
): PlayerMatchHistoryEntry[] {
  const value = MATCH_SORT_VALUES[key];
  const sign = dir === "desc" ? -1 : 1;
  return [...entries].sort((a, b) => sign * (value(a) - value(b)) || b.start_time - a.start_time);
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
  avgSouls: number;
  soulsPerMin: number;
  avgLastHits: number;
  avgDenies: number;
  lastHitsPerMin: number;
  avgDurationS: number;
  totalTimeS: number;
  /** Sum of the ranked deltas, or null when no match had one. */
  rankDelta: number | null;
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
  let denies = 0;
  let totalTimeS = 0;
  let rankDelta: number | null = null;
  let lastPlayedUnix: number | null = null;
  for (const entry of entries) {
    if (isWin(entry)) wins++;
    else if (isLoss(entry)) losses++;
    kills += entry.player_kills;
    deaths += entry.player_deaths;
    assists += entry.player_assists;
    souls += entry.net_worth;
    lastHits += entry.last_hits;
    denies += entry.denies;
    totalTimeS += entry.match_duration_s;
    if (entry.ranked_delta != null) rankDelta = (rankDelta ?? 0) + entry.ranked_delta;
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
    avgSouls: matches > 0 ? souls / matches : 0,
    soulsPerMin: minutes > 0 ? souls / minutes : 0,
    avgLastHits: matches > 0 ? lastHits / matches : 0,
    avgDenies: matches > 0 ? denies / matches : 0,
    lastHitsPerMin: minutes > 0 ? lastHits / minutes : 0,
    avgDurationS: matches > 0 ? totalTimeS / matches : 0,
    totalTimeS,
    rankDelta,
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

export function summarizeByHero(entries: PlayerMatchHistoryEntry[]): Map<number, TrackerSummary> {
  const byHero = new Map<number, PlayerMatchHistoryEntry[]>();
  for (const entry of entries) {
    const list = byHero.get(entry.hero_id);
    if (list) list.push(entry);
    else byHero.set(entry.hero_id, [entry]);
  }
  return new Map([...byHero].map(([heroId, heroEntries]) => [heroId, summarize(heroEntries)]));
}

export function perHeroRows(entries: PlayerMatchHistoryEntry[]): TrackerHeroRow[] {
  const rows: TrackerHeroRow[] = [];
  for (const [heroId, s] of summarizeByHero(entries)) {
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

export type FormResult = "win" | "loss";

/** Win/loss sequence of the most recent scored matches, newest first. */
export function recentForm(entries: PlayerMatchHistoryEntry[], count: number): FormResult[] {
  return entries.slice(0, count).map((entry) => (isWin(entry) ? "win" : "loss"));
}

/** Recent form per hero, newest first. Expects entries sorted newest first. */
export function recentFormByHero(entries: PlayerMatchHistoryEntry[], count: number): Map<number, FormResult[]> {
  const byHero = new Map<number, FormResult[]>();
  for (const entry of entries) {
    const form = byHero.get(entry.hero_id);
    if (!form) byHero.set(entry.hero_id, [isWin(entry) ? "win" : "loss"]);
    else if (form.length < count) form.push(isWin(entry) ? "win" : "loss");
  }
  return byHero;
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

export function formatPlaytime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

/** Rolling window that grows with the history so long careers smooth into a readable line. */
export function performanceWindow(matchCount: number): number {
  return Math.max(10, Math.ceil(matchCount / 100));
}

export interface PerformancePoint {
  /** 1-based position in chronological order. */
  matchNumber: number;
  time: number;
  winrate: number;
  kdaRatio: number;
  soulsPerMin: number;
}

/**
 * Rolling averages over the previous `window` matches, oldest first. The first point lands on
 * match number `window`, so the early, half-filled windows never show up as noise.
 */
export function computePerformanceTrend(entries: PlayerMatchHistoryEntry[], window: number): PerformancePoint[] {
  const chronological = [...entries].sort((a, b) => a.start_time - b.start_time);
  const points: PerformancePoint[] = [];
  let wins = 0;
  let kills = 0;
  let deaths = 0;
  let assists = 0;
  let souls = 0;
  let seconds = 0;
  for (let i = 0; i < chronological.length; i++) {
    const entry = chronological[i];
    if (isWin(entry)) wins++;
    kills += entry.player_kills;
    deaths += entry.player_deaths;
    assists += entry.player_assists;
    souls += entry.net_worth;
    seconds += entry.match_duration_s;
    if (i >= window) {
      const dropped = chronological[i - window];
      if (isWin(dropped)) wins--;
      kills -= dropped.player_kills;
      deaths -= dropped.player_deaths;
      assists -= dropped.player_assists;
      souls -= dropped.net_worth;
      seconds -= dropped.match_duration_s;
    }
    if (i < window - 1) continue;
    points.push({
      matchNumber: i + 1,
      time: entry.start_time,
      winrate: wins / window,
      kdaRatio: deaths > 0 ? (kills + assists) / deaths : kills + assists,
      soulsPerMin: seconds > 0 ? souls / (seconds / 60) : 0,
    });
  }
  return points;
}

export interface PeakRank {
  badge: number;
  time: number;
}

/** Highest ranked badge in the history and the first time it was reached. */
export function peakRank(entries: PlayerMatchHistoryEntry[]): PeakRank | null {
  let peak: PeakRank | null = null;
  for (const entry of entries) {
    const badge = entry.ranked_display_badge;
    if (badge == null || badge <= 0) continue;
    if (peak === null || badge > peak.badge || (badge === peak.badge && entry.start_time < peak.time)) {
      peak = { badge, time: entry.start_time };
    }
  }
  return peak;
}

export interface PlaySession {
  /** Start time of the newest match in the session, unique per session. */
  id: number;
  startUnix: number;
  endUnix: number;
  matches: number;
  wins: number;
  losses: number;
  /** Sum of the ranked deltas, or null when no match in the session had one. */
  rankDelta: number | null;
  totalTimeS: number;
}

const SESSION_GAP_S = 3 * 3600;

/**
 * Groups matches into play sessions, newest first. A new session begins once the time between the
 * end of one match and the start of the next exceeds the gap. Expects entries sorted newest first.
 */
export function computeSessions(entries: PlayerMatchHistoryEntry[]): Map<number, PlaySession> {
  const sessionByMatchId = new Map<number, PlaySession>();
  let session: PlaySession | null = null;
  let previous: PlayerMatchHistoryEntry | null = null;
  for (const entry of entries) {
    const endUnix = entry.start_time + entry.match_duration_s;
    if (session === null || previous === null || previous.start_time - endUnix > SESSION_GAP_S) {
      session = {
        id: entry.start_time,
        startUnix: entry.start_time,
        endUnix,
        matches: 0,
        wins: 0,
        losses: 0,
        rankDelta: null,
        totalTimeS: 0,
      };
    }
    session.startUnix = entry.start_time;
    session.matches++;
    if (isWin(entry)) session.wins++;
    else session.losses++;
    session.totalTimeS += entry.match_duration_s;
    if (entry.ranked_delta != null) session.rankDelta = (session.rankDelta ?? 0) + entry.ranked_delta;
    sessionByMatchId.set(entry.match_id, session);
    previous = entry;
  }
  return sessionByMatchId;
}

export interface RecordMatch {
  entry: PlayerMatchHistoryEntry;
  value: number;
}

export interface PersonalRecords {
  kills: RecordMatch | null;
  assists: RecordMatch | null;
  netWorth: RecordMatch | null;
  kda: RecordMatch | null;
  soulsPerMin: RecordMatch | null;
  rankGain: RecordMatch | null;
}

function best(
  entries: PlayerMatchHistoryEntry[],
  metric: (entry: PlayerMatchHistoryEntry) => number | null,
): RecordMatch | null {
  let record: RecordMatch | null = null;
  for (const entry of entries) {
    const value = metric(entry);
    if (value === null) continue;
    if (record === null || value > record.value) record = { entry, value };
  }
  return record;
}

/** Ties resolve to the earlier entry in the list, so pass entries newest first to favor recent matches. */
export function computeRecords(entries: PlayerMatchHistoryEntry[]): PersonalRecords {
  return {
    kills: best(entries, (entry) => entry.player_kills),
    assists: best(entries, (entry) => entry.player_assists),
    netWorth: best(entries, (entry) => entry.net_worth),
    kda: best(entries, kdaRatio),
    soulsPerMin: best(entries, (entry) => (entry.match_duration_s > 0 ? soulsPerMinute(entry) : null)),
    rankGain: best(entries, (entry) =>
      entry.ranked_delta != null && entry.ranked_delta > 0 ? entry.ranked_delta : null,
    ),
  };
}

export interface RecordKind {
  key: keyof PersonalRecords;
  label: string;
  format: (value: number) => string;
}

export const RECORD_KINDS: RecordKind[] = [
  { key: "kills", label: "Most kills", format: (value) => value.toLocaleString("en-US") },
  { key: "assists", label: "Most assists", format: (value) => value.toLocaleString("en-US") },
  { key: "kda", label: "Best KDA", format: (value) => value.toFixed(2) },
  { key: "netWorth", label: "Most souls", format: (value) => value.toLocaleString("en-US") },
  { key: "soulsPerMin", label: "Best souls/min", format: (value) => Math.round(value).toLocaleString("en-US") },
  { key: "rankGain", label: "Biggest rank gain", format: (value) => `+${value.toLocaleString("en-US")}` },
];

export interface HeldRecord {
  label: string;
  value: string;
}

/** The personal bests each match holds, formatted for display; matches holding none are absent. */
export function recordsByMatchId(records: PersonalRecords): Map<number, HeldRecord[]> {
  const held = new Map<number, HeldRecord[]>();
  for (const { key, label, format } of RECORD_KINDS) {
    const record = records[key];
    if (!record) continue;
    const list = held.get(record.entry.match_id) ?? [];
    list.push({ label, value: format(record.value) });
    held.set(record.entry.match_id, list);
  }
  return held;
}

export interface PlaytimeCell {
  /** 0 = Monday … 6 = Sunday, in the viewer's local time zone. */
  weekday: number;
  /** First hour of the bucket. */
  hour: number;
  matches: number;
  wins: number;
}

export interface WeekdayStats {
  weekday: number;
  matches: number;
  wins: number;
}

export interface PlaytimeHabits {
  /** One cell per weekday and hour bucket, ordered by weekday then hour. */
  cells: PlaytimeCell[];
  maxMatches: number;
  /** Weekday with the most matches. */
  favoriteWeekday: WeekdayStats | null;
  /** Weekday with the highest win rate among those with enough matches to mean something. */
  bestWeekday: WeekdayStats | null;
  /** Start hour of the three-hour window with the most matches; the window may wrap past midnight. */
  peakHourStart: number | null;
}

const BEST_WEEKDAY_MIN_MATCHES = 10;
export const PEAK_HOURS_WINDOW = 3;
export const PLAYTIME_BUCKET_HOURS = 2;
const PLAYTIME_BUCKETS_PER_DAY = 24 / PLAYTIME_BUCKET_HOURS;

export function computePlaytimeHabits(entries: PlayerMatchHistoryEntry[]): PlaytimeHabits {
  const cells: PlaytimeCell[] = [];
  for (let weekday = 0; weekday < 7; weekday++) {
    for (let bucket = 0; bucket < PLAYTIME_BUCKETS_PER_DAY; bucket++) {
      cells.push({ weekday, hour: bucket * PLAYTIME_BUCKET_HOURS, matches: 0, wins: 0 });
    }
  }
  const weekdays: WeekdayStats[] = Array.from({ length: 7 }, (_, weekday) => ({ weekday, matches: 0, wins: 0 }));
  const hours = new Array<number>(24).fill(0);
  for (const entry of entries) {
    const started = day.unix(entry.start_time);
    const weekday = (started.day() + 6) % 7;
    const hour = started.hour();
    const win = isWin(entry) ? 1 : 0;
    const cell = cells[weekday * PLAYTIME_BUCKETS_PER_DAY + Math.floor(hour / PLAYTIME_BUCKET_HOURS)];
    cell.matches++;
    cell.wins += win;
    weekdays[weekday].matches++;
    weekdays[weekday].wins += win;
    hours[hour]++;
  }

  let maxMatches = 0;
  for (const cell of cells) maxMatches = Math.max(maxMatches, cell.matches);

  let favoriteWeekday: WeekdayStats | null = null;
  let bestWeekday: WeekdayStats | null = null;
  for (const stats of weekdays) {
    if (stats.matches > 0 && (favoriteWeekday === null || stats.matches > favoriteWeekday.matches)) {
      favoriteWeekday = stats;
    }
    if (
      stats.matches >= BEST_WEEKDAY_MIN_MATCHES &&
      (bestWeekday === null || stats.wins / stats.matches > bestWeekday.wins / bestWeekday.matches)
    ) {
      bestWeekday = stats;
    }
  }

  let peakHourStart: number | null = null;
  let peakWindowMatches = 0;
  for (let start = 0; start < 24; start++) {
    let windowMatches = 0;
    for (let offset = 0; offset < PEAK_HOURS_WINDOW; offset++) windowMatches += hours[(start + offset) % 24];
    if (windowMatches > peakWindowMatches) {
      peakWindowMatches = windowMatches;
      peakHourStart = start;
    }
  }

  return { cells, maxMatches, favoriteWeekday, bestWeekday, peakHourStart };
}

export interface OutcomeSplit {
  label: string;
  matches: number;
  wins: number;
}

export interface OutcomeSplits {
  /** Fixed game-length buckets, shortest first; empty buckets are kept so the rows line up. */
  byDuration: OutcomeSplit[];
  /** Index 0 = The Hidden King, 1 = The Archmother. */
  bySide: OutcomeSplit[];
}

const DURATION_BUCKETS: { label: string; maxMinutes: number }[] = [
  { label: "Under 25 min", maxMinutes: 25 },
  { label: "25–35 min", maxMinutes: 35 },
  { label: "35–45 min", maxMinutes: 45 },
  { label: "Over 45 min", maxMinutes: Number.POSITIVE_INFINITY },
];

export const SIDE_NAMES = ["The Hidden King", "The Archmother"];

export function computeOutcomeSplits(entries: PlayerMatchHistoryEntry[]): OutcomeSplits {
  const byDuration = DURATION_BUCKETS.map((bucket) => ({ label: bucket.label, matches: 0, wins: 0 }));
  const bySide = SIDE_NAMES.map((label) => ({ label, matches: 0, wins: 0 }));
  for (const entry of entries) {
    const win = isWin(entry) ? 1 : 0;
    const minutes = entry.match_duration_s / 60;
    const bucket = byDuration[DURATION_BUCKETS.findIndex((candidate) => minutes < candidate.maxMinutes)];
    bucket.matches++;
    bucket.wins += win;
    const side = bySide[entry.player_team];
    if (side) {
      side.matches++;
      side.wins += win;
    }
  }
  return { byDuration, bySide };
}

export interface SessionMomentum {
  /** Win rate by the match's position within its session; the last bucket collects every later match. */
  byPosition: OutcomeSplit[];
  /** Win rate given the result of the previous match in the same session. */
  byPreviousResult: OutcomeSplit[];
  sessions: number;
  avgMatchesPerSession: number;
  avgSessionTimeS: number;
}

const POSITION_LABELS = ["1st match", "2nd match", "3rd match", "4th+ match"];
const TILT_LOSS_RUN = 2;

/** Expects entries sorted newest first, like `computeSessions`. */
export function computeSessionMomentum(entries: PlayerMatchHistoryEntry[]): SessionMomentum {
  const byPosition = POSITION_LABELS.map((label) => ({ label, matches: 0, wins: 0 }));
  const afterWin = { label: "After a win", matches: 0, wins: 0 };
  const afterLoss = { label: "After a loss", matches: 0, wins: 0 };
  const afterLossRun = { label: `After ${TILT_LOSS_RUN}+ losses`, matches: 0, wins: 0 };

  const sessions = computeSessions(entries);
  const sessionEntries = new Map<PlaySession, PlayerMatchHistoryEntry[]>();
  for (const entry of entries) {
    const session = sessions.get(entry.match_id) as PlaySession;
    const list = sessionEntries.get(session);
    if (list) list.push(entry);
    else sessionEntries.set(session, [entry]);
  }

  let totalTimeS = 0;
  for (const [session, newestFirst] of sessionEntries) {
    totalTimeS += session.totalTimeS;
    let previousWin: boolean | null = null;
    let lossRun = 0;
    for (let index = newestFirst.length - 1; index >= 0; index--) {
      const win = isWin(newestFirst[index]) ? 1 : 0;
      const position = byPosition[Math.min(newestFirst.length - 1 - index, POSITION_LABELS.length - 1)];
      position.matches++;
      position.wins += win;
      if (previousWin !== null) {
        const split = previousWin ? afterWin : afterLoss;
        split.matches++;
        split.wins += win;
        if (lossRun >= TILT_LOSS_RUN) {
          afterLossRun.matches++;
          afterLossRun.wins += win;
        }
      }
      previousWin = win === 1;
      lossRun = win ? 0 : lossRun + 1;
    }
  }

  const sessionCount = sessionEntries.size;
  return {
    byPosition,
    byPreviousResult: [afterWin, afterLoss, afterLossRun],
    sessions: sessionCount,
    avgMatchesPerSession: sessionCount > 0 ? entries.length / sessionCount : 0,
    avgSessionTimeS: sessionCount > 0 ? totalTimeS / sessionCount : 0,
  };
}
