/** The performance totals the hero build stats return with `include_performance`, one build's or many pooled. */
export interface BuildPerformanceTotals {
  matches: number;
  total_kills: number;
  total_deaths: number;
  total_assists: number;
  total_net_worth: number;
  total_last_hits: number;
  total_denies: number;
  total_player_damage: number;
  total_player_damage_taken: number;
  total_boss_damage: number;
  total_creep_damage: number;
  total_neutral_damage: number;
  total_max_health: number;
  total_shots_hit: number;
  total_shots_missed: number;
  total_hero_bullets_hit: number;
  total_hero_bullets_hit_crit: number;
  total_self_healing: number;
  total_player_healing: number;
  total_teammate_healing: number;
  total_damage_mitigated: number;
  total_creep_kills: number;
  total_neutral_kills: number;
  total_level: number;
  total_duration_s: number;
  /** Matches-weighted when pooled; 0 without a badge. */
  avg_average_badge: number;
}

export const PERFORMANCE_TOTAL_KEYS = [
  "total_kills",
  "total_deaths",
  "total_assists",
  "total_net_worth",
  "total_last_hits",
  "total_denies",
  "total_player_damage",
  "total_player_damage_taken",
  "total_boss_damage",
  "total_creep_damage",
  "total_neutral_damage",
  "total_max_health",
  "total_shots_hit",
  "total_shots_missed",
  "total_hero_bullets_hit",
  "total_hero_bullets_hit_crit",
  "total_self_healing",
  "total_player_healing",
  "total_teammate_healing",
  "total_damage_mitigated",
  "total_creep_kills",
  "total_neutral_kills",
  "total_level",
  "total_duration_s",
] as const satisfies readonly (keyof BuildPerformanceTotals)[];

/** Every build's totals added up: the hero's average build, to compare one build with. */
export function poolPerformance(rows: readonly BuildPerformanceTotals[]): BuildPerformanceTotals | null {
  if (rows.length === 0) return null;
  const pooled = { matches: 0, avg_average_badge: 0 } as BuildPerformanceTotals;
  for (const key of PERFORMANCE_TOTAL_KEYS) pooled[key] = 0;
  let badgeWeight = 0;
  for (const row of rows) {
    pooled.matches += row.matches;
    for (const key of PERFORMANCE_TOTAL_KEYS) pooled[key] += row[key];
    if (row.avg_average_badge > 0) {
      pooled.avg_average_badge += row.avg_average_badge * row.matches;
      badgeWeight += row.matches;
    }
  }
  pooled.avg_average_badge = badgeWeight > 0 ? pooled.avg_average_badge / badgeWeight : 0;
  return pooled;
}

export type MetricGroup = "combat" | "economy" | "support";

export interface BuildMetric {
  key: string;
  label: string;
  group: MetricGroup;
  /** The value of one build's (or the pooled) totals; null where it cannot be told (no shots, no minutes). */
  value: (t: BuildPerformanceTotals) => number | null;
  format: (value: number) => string;
  /** Whether more of it is better for the build's player, for the color of a difference; `neutral` only describes. */
  polarity: "higher-is-better" | "lower-is-better" | "neutral";
  /** How a difference with the average is shown: as a relative change (+12%) or in points (+1.2 pp). */
  delta: "relative" | "points";
}

const perMatch = (total: number, t: BuildPerformanceTotals) => (t.matches > 0 ? total / t.matches : null);
const perMinute = (total: number, t: BuildPerformanceTotals) =>
  t.total_duration_s > 0 ? total / (t.total_duration_s / 60) : null;
const ratio = (part: number, whole: number) => (whole > 0 ? part / whole : null);

const fixed = (digits: number) => (value: number) =>
  value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const whole = (value: number) => Math.round(value).toLocaleString("en-US");
const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
const minutes = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, "0")}`;

/** Every number the page derives from a build's performance totals, in the order it lists them. */
export const BUILD_METRICS: readonly BuildMetric[] = [
  {
    key: "kda",
    label: "KDA",
    group: "combat",
    value: (t) => ratio(t.total_kills + t.total_assists, Math.max(1, t.total_deaths)),
    format: fixed(2),
    polarity: "higher-is-better",
    delta: "relative",
  },
  {
    key: "kills",
    label: "Kills",
    group: "combat",
    value: (t) => perMatch(t.total_kills, t),
    format: fixed(1),
    polarity: "higher-is-better",
    delta: "relative",
  },
  {
    key: "deaths",
    label: "Deaths",
    group: "combat",
    value: (t) => perMatch(t.total_deaths, t),
    format: fixed(1),
    polarity: "lower-is-better",
    delta: "relative",
  },
  {
    key: "assists",
    label: "Assists",
    group: "combat",
    value: (t) => perMatch(t.total_assists, t),
    format: fixed(1),
    polarity: "higher-is-better",
    delta: "relative",
  },
  {
    key: "damagePerMin",
    label: "Hero damage/min",
    group: "combat",
    value: (t) => perMinute(t.total_player_damage, t),
    format: whole,
    polarity: "higher-is-better",
    delta: "relative",
  },
  {
    key: "damageTakenPerMin",
    label: "Damage taken/min",
    group: "combat",
    value: (t) => perMinute(t.total_player_damage_taken, t),
    format: whole,
    polarity: "neutral",
    delta: "relative",
  },
  {
    key: "accuracy",
    label: "Accuracy",
    group: "combat",
    value: (t) => ratio(t.total_shots_hit, t.total_shots_hit + t.total_shots_missed),
    format: percent,
    polarity: "higher-is-better",
    delta: "points",
  },
  {
    key: "critRate",
    label: "Headshot rate",
    group: "combat",
    value: (t) => ratio(t.total_hero_bullets_hit_crit, t.total_hero_bullets_hit),
    format: percent,
    polarity: "higher-is-better",
    delta: "points",
  },
  {
    key: "soulsPerMin",
    label: "Souls/min",
    group: "economy",
    value: (t) => perMinute(t.total_net_worth, t),
    format: whole,
    polarity: "higher-is-better",
    delta: "relative",
  },
  {
    key: "lastHits",
    label: "Last hits",
    group: "economy",
    value: (t) => perMatch(t.total_last_hits, t),
    format: fixed(0),
    polarity: "higher-is-better",
    delta: "relative",
  },
  {
    key: "denies",
    label: "Denies",
    group: "economy",
    value: (t) => perMatch(t.total_denies, t),
    format: fixed(1),
    polarity: "higher-is-better",
    delta: "relative",
  },
  {
    key: "neutralKills",
    label: "Neutral camps",
    group: "economy",
    value: (t) => perMatch(t.total_neutral_kills, t),
    format: fixed(1),
    polarity: "neutral",
    delta: "relative",
  },
  {
    key: "objectiveDamage",
    label: "Objective damage",
    group: "economy",
    value: (t) => perMatch(t.total_boss_damage, t),
    format: whole,
    polarity: "higher-is-better",
    delta: "relative",
  },
  {
    key: "level",
    label: "Final level",
    group: "economy",
    value: (t) => perMatch(t.total_level, t),
    format: fixed(1),
    polarity: "neutral",
    delta: "relative",
  },
  {
    key: "duration",
    label: "Match length",
    group: "economy",
    value: (t) => perMatch(t.total_duration_s, t),
    format: minutes,
    polarity: "neutral",
    delta: "relative",
  },
  {
    key: "selfHealingPerMin",
    label: "Self healing/min",
    group: "support",
    value: (t) => perMinute(t.total_self_healing, t),
    format: whole,
    polarity: "neutral",
    delta: "relative",
  },
  {
    key: "teammateHealing",
    label: "Team healing",
    group: "support",
    value: (t) => perMatch(t.total_teammate_healing, t),
    format: whole,
    polarity: "neutral",
    delta: "relative",
  },
  {
    key: "mitigatedPerMin",
    label: "Damage mitigated/min",
    group: "support",
    value: (t) => perMinute(t.total_damage_mitigated, t),
    format: whole,
    polarity: "neutral",
    delta: "relative",
  },
  {
    key: "maxHealth",
    label: "Max health",
    group: "support",
    value: (t) => perMatch(t.total_max_health, t),
    format: whole,
    polarity: "neutral",
    delta: "relative",
  },
];

/** A metric's difference from the average: relative (0.12 for +12%) or in points of a rate (0.012). */
/**
 * The smallest metricDelta that counts as a difference between two builds: 5% of a count or rate, a point of a
 * percentage. Smaller ones sit inside what players of one build vary by from match to match.
 */
export function metricNoise(metric: BuildMetric): number {
  return metric.delta === "points" ? 0.01 : 0.05;
}

export function metricDelta(metric: BuildMetric, value: number | null, average: number | null): number | null {
  if (value === null || average === null) return null;
  if (metric.delta === "points") return value - average;
  // Where either side prints as zero ("0" team healing for a hero without any) a relative change is noise of any size,
  // +665% from 0.4 to 3, or reads as an error, "0 −89%": it has none.
  const zero = metric.format(0);
  return metric.format(average) !== zero && metric.format(value) !== zero ? value / average - 1 : null;
}
