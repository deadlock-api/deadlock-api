import type { ModeRecap, RecapDamageSource, RecapHero, RecapMatch, RecapTotals, YearRecap } from "./types";

// Pure readings of a year recap. Wall-clock views (calendar, hour of day) take a `partsOf` that turns a unix time into
// the visitor's local date and hour, so the server can render them in UTC and the client again in its own zone.

export interface TimeParts {
  year: number;
  /** 0-11 */
  month: number;
  /** 1-31 */
  day: number;
  /** 0-23 */
  hour: number;
}

export const utcParts = (unix: number): TimeParts => {
  const date = new Date(unix * 1000);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth(), day: date.getUTCDate(), hour: date.getUTCHours() };
};

/** Small samples say little: a hero, an item or a teammate needs this many matches before its win rate is a story. */
export const MIN_SAMPLE = 10;

/** Detail chapters (sides, shop, survival, kill types) need this many matches with per-match details. */
export const MIN_DETAILED_MATCHES = 10;
/** Damage-matrix chapters (play style, favourite victim, crowd control) need this many matches with it. */
export const MIN_DAMAGE_MATRIX_MATCHES = 5;

export const hasDetails = (totals: Pick<RecapTotals, "detailed_matches">) =>
  totals.detailed_matches >= MIN_DETAILED_MATCHES;
export const hasDamageMatrix = (totals: Pick<RecapTotals, "damage_matrix_matches">) =>
  totals.damage_matrix_matches >= MIN_DAMAGE_MATRIX_MATCHES;

export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;
export const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

export const ratio = (part: number, whole: number): number | null => (whole > 0 ? part / whole : null);

export function kda({ kills, deaths, assists }: Pick<RecapTotals, "kills" | "deaths" | "assists">): number {
  return (kills + assists) / Math.max(1, deaths);
}

/** The mode most chapters read: normal matches when there are any, else the only mode played. */
export function mainMode(recap: YearRecap): ModeRecap | undefined {
  return recap.modes.find((mode) => mode.game_mode === "normal") ?? recap.modes[0];
}

/** Street Brawl as a chapter of its own, only beside normal matches (alone, it is the main mode). */
export function brawlMode(recap: YearRecap): ModeRecap | undefined {
  const main = mainMode(recap);
  return main?.game_mode === "normal" ? recap.modes.find((mode) => mode.game_mode === "street_brawl") : undefined;
}

export interface YearTotals {
  matches: number;
  wins: number;
  seconds: number;
}

export function yearTotals(recap: YearRecap): YearTotals {
  return recap.modes.reduce(
    (sum, mode) => ({
      matches: sum.matches + mode.totals.matches,
      wins: sum.wins + mode.totals.wins,
      seconds: sum.seconds + mode.totals.seconds_played,
    }),
    { matches: 0, wins: 0, seconds: 0 },
  );
}

/** Days since 1 January of `year` (0-based) of a calendar date. Works across years. */
export function dayIndex(year: number, month: number, day: number): number {
  return Math.round((Date.UTC(year, month, day) - Date.UTC(year, 0, 1)) / 86_400_000);
}

/** Month 12 of a year is January of the next, so this is the length of the year. */
export const daysInYear = (year: number) => dayIndex(year, 12, 1);

/** The date of a day index, back as a month and a day. */
export function dateOfIndex(year: number, index: number): { month: number; day: number } {
  const date = new Date(Date.UTC(year, 0, 1 + index));
  return { month: date.getUTCMonth(), day: date.getUTCDate() };
}

export interface DayActivity {
  index: number;
  month: number;
  day: number;
  matches: number;
  wins: number;
  seconds: number;
}

/**
 * Matches per calendar day of `year`, as `partsOf` dates them. A match that lands in another year in the visitor's
 * zone (a game just after midnight UTC on 1 January) falls outside the calendar.
 */
export function dailyActivity(matches: readonly RecapMatch[], year: number, partsOf: (unix: number) => TimeParts) {
  const days: DayActivity[] = Array.from({ length: daysInYear(year) }, (_, index) => ({
    index,
    ...dateOfIndex(year, index),
    matches: 0,
    wins: 0,
    seconds: 0,
  }));
  for (const match of matches) {
    const parts = partsOf(match.start_time);
    if (parts.year !== year) continue;
    const day = days[dayIndex(year, parts.month, parts.day)];
    if (!day) continue;
    day.matches += 1;
    day.wins += match.won ? 1 : 0;
    day.seconds += match.duration_s;
  }
  return days;
}

export interface ActivitySummary {
  activeDays: number;
  busiest: DayActivity | null;
  /** The longest run of consecutive days with at least one match. */
  longestStreak: { length: number; from: DayActivity; to: DayActivity } | null;
  /** 0 = Monday. */
  favoriteWeekday: { weekday: number; matches: number } | null;
  maxMatches: number;
}

export function summarizeDays(year: number, days: readonly DayActivity[]): ActivitySummary {
  let busiest: DayActivity | null = null;
  let best: ActivitySummary["longestStreak"] = null;
  let runStart: DayActivity | null = null;
  let activeDays = 0;
  const weekdays = Array.from({ length: 7 }, () => 0);
  for (const day of days) {
    if (day.matches === 0) {
      runStart = null;
      continue;
    }
    activeDays += 1;
    weekdays[weekdayOf(year, day.index)] += day.matches;
    if (!busiest || day.matches > busiest.matches) busiest = day;
    runStart ??= day;
    const length = day.index - runStart.index + 1;
    if (!best || length > best.length) best = { length, from: runStart, to: day };
  }
  const top = weekdays.reduce((at, count, index) => (count > (weekdays[at] ?? 0) ? index : at), 0);
  return {
    activeDays,
    busiest,
    longestStreak: best,
    favoriteWeekday: activeDays > 0 ? { weekday: top, matches: weekdays[top] ?? 0 } : null,
    maxMatches: busiest?.matches ?? 0,
  };
}

/** 0 = Monday ... 6 = Sunday, of a day index of `year`. */
export function weekdayOf(year: number, index: number): number {
  return (new Date(Date.UTC(year, 0, 1 + index)).getUTCDay() + 6) % 7;
}

/** The weekday (0 = Monday) the 1st of a month falls on and the month's length: one small calendar. */
export function monthGrid(year: number, month: number): { offset: number; days: number } {
  return {
    offset: weekdayOf(year, dayIndex(year, month, 1)),
    days: dayIndex(year, month + 1, 1) - dayIndex(year, month, 1),
  };
}

export function hourCounts(matches: readonly RecapMatch[], partsOf: (unix: number) => TimeParts): number[] {
  const hours = Array.from({ length: 24 }, () => 0);
  for (const match of matches) hours[partsOf(match.start_time).hour] += 1;
  return hours;
}

export type Chronotype = "night-owl" | "early-bird" | "after-work" | "daytime";

/**
 * When the player's matches start, in words: night owl when a quarter starts between midnight and 5:00, early bird
 * when a quarter starts between 5:00 and 11:00, after work when most start from 17:00, daytime otherwise.
 */
export function chronotype(hours: readonly number[]): { type: Chronotype; share: number } | null {
  const total = hours.reduce((sum, count) => sum + count, 0);
  if (total === 0) return null;
  const between = (from: number, to: number) => hours.slice(from, to).reduce((sum, count) => sum + count, 0) / total;
  const night = between(0, 5);
  const morning = between(5, 11);
  const evening = between(17, 24);
  if (night >= 0.25) return { type: "night-owl", share: night };
  if (morning >= 0.25) return { type: "early-bird", share: morning };
  if (evening >= 0.5) return { type: "after-work", share: evening };
  return { type: "daytime", share: between(11, 17) };
}

export interface MonthRecord {
  month: number;
  wins: number;
  losses: number;
}

export function monthlyRecord(matches: readonly RecapMatch[], year: number, partsOf: (unix: number) => TimeParts) {
  const months: MonthRecord[] = MONTH_NAMES.map((_, month) => ({ month, wins: 0, losses: 0 }));
  for (const match of matches) {
    const parts = partsOf(match.start_time);
    const month = parts.year === year ? months[parts.month] : undefined;
    if (!month) continue;
    if (match.won) month.wins += 1;
    else month.losses += 1;
  }
  return months;
}

/** The hero with the best win rate among those played at least `min` times. */
export function bestWinRateHero(heroes: readonly RecapHero[], min = MIN_SAMPLE): RecapHero | null {
  let best: RecapHero | null = null;
  for (const hero of heroes) {
    if (hero.matches < min) continue;
    if (!best || hero.wins / hero.matches > best.wins / best.matches) best = hero;
  }
  return best;
}

/** One damage source of the year, its weapon's crit damage folded in. */
export interface DamageSource {
  /** The class name without a `_crit` suffix. */
  source: string;
  kind: "weapon" | "item" | "ability";
  damage: number;
  matches: number;
}

export function damageSourceKind(source: string): DamageSource["kind"] {
  if (source.startsWith("citadel_weapon_")) return "weapon";
  if (source.startsWith("upgrade_")) return "item";
  return "ability";
}

/** Merges each weapon's `_crit` part into it; most damage first. */
export function mergeDamageSources(sources: readonly RecapDamageSource[]): DamageSource[] {
  const merged = new Map<string, DamageSource>();
  for (const { source, damage, matches } of sources) {
    const key = source.replace(/_crit$/, "");
    const entry = merged.get(key);
    if (entry) {
      entry.damage += damage;
      entry.matches = Math.max(entry.matches, matches);
    } else merged.set(key, { source: key, kind: damageSourceKind(key), damage, matches });
  }
  return [...merged.values()].sort((a, b) => b.damage - a.damage);
}

/** The hero codename a weapon class names: `citadel_weapon_fencer_set` is `fencer` (`hero_fencer`). */
export function weaponCodename(source: string): string {
  return source.replace(/^citadel_weapon_/, "").replace(/_set\d*$/, "");
}

export type DamageStyle = "gunslinger" | "spirit" | "brawler" | "hybrid";

export interface DamageSplit {
  style: DamageStyle;
  bullet: number;
  ability: number;
  melee: number;
  total: number;
}

/**
 * The player's style from where their hero damage came from: brawler with a quarter of it in melee, gunslinger or
 * spirit caster with 55% from bullets or abilities, hybrid otherwise.
 */
export function damageSplit({ dm_bullet, dm_ability, dm_melee }: RecapTotals): DamageSplit | null {
  const total = dm_bullet + dm_ability + dm_melee;
  if (total === 0) return null;
  const bullet = dm_bullet / total;
  const ability = dm_ability / total;
  const melee = dm_melee / total;
  const style: DamageStyle =
    melee >= 0.25 ? "brawler" : bullet >= 0.55 ? "gunslinger" : ability >= 0.55 ? "spirit" : "hybrid";
  return { style, bullet, ability, melee, total };
}

export interface SoulSource {
  key: "gold_players" | "gold_lane_creeps" | "gold_neutrals" | "gold_bosses" | "gold_treasure" | "gold_breakables";
  label: string;
  souls: number;
}

const SOUL_SOURCES: readonly Omit<SoulSource, "souls">[] = [
  { key: "gold_lane_creeps", label: "Lane troopers" },
  { key: "gold_players", label: "Heroes" },
  { key: "gold_neutrals", label: "Neutral camps" },
  { key: "gold_bosses", label: "Objectives and bosses" },
  { key: "gold_breakables", label: "Breakables" },
  { key: "gold_treasure", label: "Treasure" },
];

/** Souls earned by source in the detailed matches, largest first; empty when none were recorded. */
export function soulSources(totals: RecapTotals): SoulSource[] {
  return SOUL_SOURCES.map(({ key, label }) => ({ key, label, souls: totals[key] }))
    .filter((source) => source.souls > 0)
    .sort((a, b) => b.souls - a.souls);
}

/** How a span of time compares to things everybody knows, biggest unit that fits first. */
export function timeComparison(seconds: number): { count: number; unit: string } {
  const hours = seconds / 3600;
  if (hours >= 48) return { count: hours / 24, unit: "days of nonstop Deadlock" };
  // The Lord of the Rings, all three extended editions: about 11 hours 26 minutes.
  if (hours >= 11.5) return { count: seconds / 41_160, unit: "extended Lord of the Rings marathons" };
  if (hours >= 2) return { count: hours / 2, unit: "feature films" };
  return { count: seconds / 60, unit: "minutes" };
}

/** A count for prose: one decimal under ten, whole above. */
export function roughCount(value: number): string {
  if (value >= 10) return Math.round(value).toLocaleString("en-US");
  return value.toLocaleString("en-US", { maximumFractionDigits: 1 });
}
