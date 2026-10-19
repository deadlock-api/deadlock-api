import type { PlayerMatchHistoryEntry } from "deadlock_api_client";

import { formatPercent } from "~/lib/format";
import { type LaneInfo, LANES } from "~/lib/team-builder/lanes";
import type { Polarity } from "~/lib/tone";
import type { TrackerMatchStat } from "~/queries/tracker-queries";

import { isWin } from "./compute";
import { LANE_PHASE_END_S, statAt } from "./lane-matchup";
import { MIN_COMPARISON_MATCHES } from "./overview";

/** One laner's soul timeline, as the lane query returns it. */
export interface LaneTimeline {
  account_id: number;
  team: string;
  hero_id: number;
  stats: TrackerMatchStat[];
}

/** How the tracked player's lane stood when the laning phase ended. */
export interface TrackerLaneState {
  /** `assigned_lane`. */
  lane: number;
  /** The tracked player's side's lane souls minus the other side's. Negative means behind. */
  diff: number;
  /** The tracked player's own cumulative stats at the laning phase end. */
  own: TrackerMatchStat;
  enemyHeroIds: number[];
}

/** One match's stored end-of-match stats for the tracked player, beyond what the match history row holds. */
export interface TrackerMatchStats {
  match_id: number;
  player_damage: number;
  player_damage_taken: number;
  boss_damage: number;
  healing: number;
  shots_hit: number;
  shots_missed: number;
  hero_bullets_hit: number;
  hero_bullets_hit_crit: number;
  neutral_souls: number;
  souls_lost: number;
  /** Null without a soul timeline, off the laned map, or in a match over before the laning phase was. */
  lane: TrackerLaneState | null;
}

/**
 * The tracked player's lane at the laning phase end, from the timelines of everyone in it. Null when the match ended
 * earlier, the player is missing, or either side has nobody in the lane.
 */
export function laneStateOf(
  laners: readonly LaneTimeline[],
  accountId: number,
  lane: number,
  durationS: number,
): TrackerLaneState | null {
  if (lane === 0 || durationS < LANE_PHASE_END_S) return null;
  const tracked = laners.find((laner) => laner.account_id === accountId);
  const own = tracked && statAt(tracked.stats, LANE_PHASE_END_S);
  if (!tracked || !own) return null;
  let diff = 0;
  let allies = 0;
  let enemies = 0;
  const enemyHeroIds: number[] = [];
  for (const laner of laners) {
    const stat = statAt(laner.stats, LANE_PHASE_END_S);
    if (!stat) return null;
    if (laner.team === tracked.team) {
      allies++;
      diff += stat.net_worth;
    } else {
      enemies++;
      diff -= stat.net_worth;
      enemyHeroIds.push(laner.hero_id);
    }
  }
  if (allies === 0 || enemies === 0) return null;
  return { lane, diff, own, enemyHeroIds };
}

/** A selected match with its stored stats, when the API has them. */
export interface StatMatch {
  entry: PlayerMatchHistoryEntry;
  stats: TrackerMatchStats | undefined;
}

export type TrendMetricGroup = "Laning" | "Combat" | "Farming" | "Shooting";

export interface TrendMetric {
  key: string;
  label: string;
  group: TrendMetricGroup;
  format: (value: number) => string;
  /** The change between two averages, in `Delta`'s terms. */
  change: { digits: number; scale?: number; unit?: string };
  polarity: Polarity;
  /** Means nothing in Street Brawl, whose souls come from fixed grants. */
  economy?: boolean;
  /** Needs a lane, which Street Brawl's map does not have. */
  laning?: boolean;
  /** Null when the match lacks what the metric reads. */
  value: (match: StatMatch) => number | null;
}

const integer = (value: number) => Math.round(value).toLocaleString("en-US");
const signedInteger = (value: number) => `${value > 0 ? "+" : ""}${integer(value)}`;
const decimal = (value: number) => value.toFixed(1);
const ratio = (value: number) => value.toFixed(2);
const percent = (value: number) => formatPercent(value);

const minutes = ({ entry }: StatMatch) => (entry.match_duration_s > 0 ? entry.match_duration_s / 60 : null);
const perMinute =
  (read: (stats: TrackerMatchStats) => number) =>
  (match: StatMatch): number | null => {
    const mins = minutes(match);
    return match.stats && mins ? read(match.stats) / mins : null;
  };
const atLaneEnd =
  (read: (stat: TrackerMatchStat) => number) =>
  ({ stats }: StatMatch): number | null =>
    stats?.lane ? read(stats.lane.own) : null;
const share = (part: number, total: number) => (total > 0 ? part / total : null);

const INTEGER_CHANGE = { digits: 0 };
const DECIMAL_CHANGE = { digits: 1 };
const PERCENT_CHANGE = { digits: 1, scale: 100, unit: " pp" };

/** Every per-match stat the trends offer, grouped, in display order. */
export const TREND_METRICS: readonly TrendMetric[] = [
  {
    key: "lane_won",
    label: "Lanes won",
    group: "Laning",
    format: percent,
    change: PERCENT_CHANGE,
    polarity: "higher-is-better",
    laning: true,
    value: ({ stats }) => (stats?.lane ? Number(stats.lane.diff > 0) : null),
  },
  {
    key: "lane_diff",
    label: "Lane souls lead",
    group: "Laning",
    format: signedInteger,
    change: INTEGER_CHANGE,
    polarity: "higher-is-better",
    laning: true,
    value: ({ stats }) => stats?.lane?.diff ?? null,
  },
  {
    key: "lane_souls",
    label: "Souls at 9:00",
    group: "Laning",
    format: integer,
    change: INTEGER_CHANGE,
    polarity: "higher-is-better",
    laning: true,
    value: atLaneEnd((stat) => stat.net_worth),
  },
  {
    key: "lane_last_hits",
    label: "Last hits at 9:00",
    group: "Laning",
    format: decimal,
    change: DECIMAL_CHANGE,
    polarity: "higher-is-better",
    laning: true,
    value: atLaneEnd((stat) => stat.creep_kills),
  },
  {
    key: "lane_denies",
    label: "Denies at 9:00",
    group: "Laning",
    format: decimal,
    change: DECIMAL_CHANGE,
    polarity: "higher-is-better",
    laning: true,
    value: atLaneEnd((stat) => stat.denies),
  },
  {
    key: "lane_kills",
    label: "Kills by 9:00",
    group: "Laning",
    format: ratio,
    change: { digits: 2 },
    polarity: "higher-is-better",
    laning: true,
    value: atLaneEnd((stat) => stat.kills),
  },
  {
    key: "lane_deaths",
    label: "Deaths by 9:00",
    group: "Laning",
    format: ratio,
    change: { digits: 2 },
    polarity: "lower-is-better",
    laning: true,
    value: atLaneEnd((stat) => stat.deaths),
  },
  {
    key: "lane_damage",
    label: "Hero damage by 9:00",
    group: "Laning",
    format: integer,
    change: INTEGER_CHANGE,
    polarity: "higher-is-better",
    laning: true,
    value: atLaneEnd((stat) => stat.player_damage),
  },
  {
    key: "kills",
    label: "Kills",
    group: "Combat",
    format: decimal,
    change: DECIMAL_CHANGE,
    polarity: "higher-is-better",
    value: ({ entry }) => entry.player_kills,
  },
  {
    key: "deaths",
    label: "Deaths",
    group: "Combat",
    format: decimal,
    change: DECIMAL_CHANGE,
    polarity: "lower-is-better",
    value: ({ entry }) => entry.player_deaths,
  },
  {
    key: "assists",
    label: "Assists",
    group: "Combat",
    format: decimal,
    change: DECIMAL_CHANGE,
    polarity: "higher-is-better",
    value: ({ entry }) => entry.player_assists,
  },
  {
    key: "damage_per_min",
    label: "Hero damage / min",
    group: "Combat",
    format: integer,
    change: INTEGER_CHANGE,
    polarity: "higher-is-better",
    value: perMinute((stats) => stats.player_damage),
  },
  {
    key: "damage_taken_per_min",
    label: "Damage taken / min",
    group: "Combat",
    format: integer,
    change: INTEGER_CHANGE,
    // More taken is a frontliner doing their job as often as a player out of position.
    polarity: "neutral",
    value: perMinute((stats) => stats.player_damage_taken),
  },
  {
    key: "healing_per_min",
    label: "Healing / min",
    group: "Combat",
    format: integer,
    change: INTEGER_CHANGE,
    polarity: "higher-is-better",
    value: perMinute((stats) => stats.healing),
  },
  {
    key: "objective_damage_per_min",
    label: "Objective dmg / min",
    group: "Combat",
    format: integer,
    change: INTEGER_CHANGE,
    polarity: "higher-is-better",
    value: perMinute((stats) => stats.boss_damage),
  },
  {
    key: "souls_per_min",
    label: "Souls / min",
    group: "Farming",
    format: integer,
    change: INTEGER_CHANGE,
    polarity: "higher-is-better",
    economy: true,
    value: (match) => {
      const mins = minutes(match);
      return mins ? match.entry.net_worth / mins : null;
    },
  },
  {
    key: "last_hits_per_min",
    label: "Last hits / min",
    group: "Farming",
    format: ratio,
    change: { digits: 2 },
    polarity: "higher-is-better",
    value: (match) => {
      const mins = minutes(match);
      return mins ? match.entry.last_hits / mins : null;
    },
  },
  {
    key: "denies",
    label: "Denies",
    group: "Farming",
    format: decimal,
    change: DECIMAL_CHANGE,
    polarity: "higher-is-better",
    value: ({ entry }) => entry.denies,
  },
  {
    key: "neutral_souls_per_min",
    label: "Jungle souls / min",
    group: "Farming",
    format: integer,
    change: INTEGER_CHANGE,
    polarity: "higher-is-better",
    economy: true,
    value: perMinute((stats) => stats.neutral_souls),
  },
  {
    key: "souls_lost",
    label: "Souls lost on death",
    group: "Farming",
    format: integer,
    change: INTEGER_CHANGE,
    polarity: "lower-is-better",
    economy: true,
    value: ({ stats }) => stats?.souls_lost ?? null,
  },
  {
    key: "accuracy",
    label: "Accuracy",
    group: "Shooting",
    format: percent,
    change: PERCENT_CHANGE,
    polarity: "higher-is-better",
    value: ({ stats }) => (stats ? share(stats.shots_hit, stats.shots_hit + stats.shots_missed) : null),
  },
  {
    key: "crit_rate",
    label: "Critical shot rate",
    group: "Shooting",
    format: percent,
    change: PERCENT_CHANGE,
    polarity: "higher-is-better",
    value: ({ stats }) => (stats ? share(stats.hero_bullets_hit_crit, stats.hero_bullets_hit) : null),
  },
];

/** The metrics that mean something in a game mode. */
export function trendMetricsFor(soulEconomy: boolean, laned: boolean): TrendMetric[] {
  return TREND_METRICS.filter((metric) => (soulEconomy || !metric.economy) && (laned || !metric.laning));
}

export interface MetricPoint {
  matchId: number;
  time: number;
  value: number;
}

/** The metric's readings, oldest first, over the matches that have one. */
export function metricSeries(matches: readonly StatMatch[], metric: TrendMetric): MetricPoint[] {
  const points: MetricPoint[] = [];
  for (const match of matches) {
    const value = metric.value(match);
    if (value != null && Number.isFinite(value)) {
      points.push({ matchId: match.entry.match_id, time: match.entry.start_time, value });
    }
  }
  return points.sort((a, b) => a.time - b.time || a.matchId - b.matchId);
}

/** Rolling means over the previous `window` readings; the first lands on the `window`th reading. */
export function rollingMean(series: readonly MetricPoint[], window: number): MetricPoint[] {
  const points: MetricPoint[] = [];
  let sum = 0;
  for (let i = 0; i < series.length; i++) {
    sum += series[i].value;
    if (i >= window) sum -= series[i - window].value;
    if (i >= window - 1) points.push({ ...series[i], value: sum / window });
  }
  return points;
}

const mean = (points: readonly MetricPoint[]) =>
  points.length ? points.reduce((sum, point) => sum + point.value, 0) / points.length : null;

export interface MetricSummary {
  /** Mean over every reading. */
  overall: number | null;
  /** Mean over the latest `window` readings. */
  recent: number | null;
  /** Mean over the `window` readings before those; null under `MIN_COMPARISON_MATCHES` of them. */
  previous: number | null;
  readings: number;
}

/** The latest window against the one before it, never against a tiny baseline. */
export function summarizeMetric(series: readonly MetricPoint[], window: number): MetricSummary {
  const recent = series.slice(-window);
  const previous = series.slice(-2 * window, -window);
  return {
    overall: mean(series),
    recent: mean(recent),
    previous: previous.length >= MIN_COMPARISON_MATCHES ? mean(previous) : null,
    readings: series.length,
  };
}

export interface LaneRecord {
  lanes: number;
  /** Lanes ahead at the laning phase end; a dead-even lane counts for neither side. */
  won: number;
  lost: number;
  diffSum: number;
  /** Matches won, of these lanes. */
  matchWins: number;
}

const emptyRecord = (): LaneRecord => ({ lanes: 0, won: 0, lost: 0, diffSum: 0, matchWins: 0 });

function add(record: LaneRecord, state: TrackerLaneState, won: boolean) {
  record.lanes++;
  if (state.diff > 0) record.won++;
  if (state.diff < 0) record.lost++;
  record.diffSum += state.diff;
  if (won) record.matchWins++;
}

export interface LaneSummary {
  all: LaneRecord;
  /** Matches won after winning the lane, and after losing it. */
  afterWon: { matches: number; wins: number };
  afterLost: { matches: number; wins: number };
  byLane: { lane: LaneInfo; record: LaneRecord }[];
  /** Every hero laned against, most often faced first. */
  byOpponent: { heroId: number; record: LaneRecord }[];
}

export function summarizeLanes(matches: readonly StatMatch[]): LaneSummary {
  const all = emptyRecord();
  const afterWon = { matches: 0, wins: 0 };
  const afterLost = { matches: 0, wins: 0 };
  const byLane = new Map<number, LaneRecord>();
  const byOpponent = new Map<number, LaneRecord>();
  for (const { entry, stats } of matches) {
    const state = stats?.lane;
    if (!state) continue;
    const won = isWin(entry);
    add(all, state, won);
    const after = state.diff > 0 ? afterWon : state.diff < 0 ? afterLost : null;
    if (after) {
      after.matches++;
      if (won) after.wins++;
    }
    let laneRecord = byLane.get(state.lane);
    if (!laneRecord) byLane.set(state.lane, (laneRecord = emptyRecord()));
    add(laneRecord, state, won);
    for (const heroId of new Set(state.enemyHeroIds)) {
      let record = byOpponent.get(heroId);
      if (!record) byOpponent.set(heroId, (record = emptyRecord()));
      add(record, state, won);
    }
  }
  return {
    all,
    afterWon,
    afterLost,
    byLane: LANES.map((lane) => ({ lane, record: byLane.get(lane.id) ?? emptyRecord() })),
    byOpponent: [...byOpponent]
      .map(([heroId, record]) => ({ heroId, record }))
      .sort((a, b) => b.record.lanes - a.record.lanes || a.record.diffSum - b.record.diffSum),
  };
}
