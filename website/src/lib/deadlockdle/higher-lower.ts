import type {
  AnalyticsAbilityOrderStats,
  AnalyticsGameStats,
  AnalyticsHeroStats,
  HeroCounterStats,
} from "deadlock_api_client";

import { day } from "~/dayjs";
import { formatPercent, possessive } from "~/lib/format";

import { getModeSeed, seededRandom, seededShuffle } from "./seed";

export const ROUND_COUNT = 10;

export type HigherLowerCategory = "heroes" | "matchups" | "economy" | "abilities";

export const CATEGORY_LABEL: Record<HigherLowerCategory, string> = {
  heroes: "Hero Meta",
  matchups: "Matchups",
  economy: "Soul Economy",
  abilities: "Ability Order",
};

/** The day's rounds by category, before they are shuffled into play order. */
const ROUND_PLAN: HigherLowerCategory[] = [
  "heroes",
  "heroes",
  "heroes",
  "matchups",
  "matchups",
  "matchups",
  "economy",
  "economy",
  "abilities",
  "abilities",
];

const ABILITY_ROUNDS = ROUND_PLAN.filter((category) => category === "abilities").length;

export type ValueFormat = "percent" | "decimal" | "number";

export type Contender = (
  | { kind: "hero"; heroId: number; name: string }
  | { kind: "ability"; abilityId: number; name: string }
  | { kind: "source"; name: string }
) & {
  value: number;
  /** For a rate (a win rate, a share of players): how many matches it is measured over, to test the gap against. */
  sample?: number;
};

/** The analytics page a round's numbers come from, linked once the round is answered. */
export type StatSource =
  | { page: "hero-stats" }
  | { page: "hero-scoreboard" }
  | { page: "matchup"; heroId: number }
  | { page: "abilities"; heroId: number }
  | { page: "economy" };

export interface HigherLowerRound {
  category: HigherLowerCategory;
  source: StatSource;
  /**
   * `higher-lower`: the left value is shown and the player guesses whether the right one is higher or lower.
   * `head-to-head`: both are hidden and the player picks the side with the higher value, the winner of a matchup.
   */
  kind: "higher-lower" | "head-to-head";
  /** The hero both values belong to, when the contenders are its abilities. */
  subject?: { heroId: number; name: string };
  /** What both values measure, e.g. "Win rate" or, under a subject, "Players who max it first". */
  stat: string;
  /** The question read aloud and shown above the cards. */
  question: string;
  format: ValueFormat;
  /** The value shown from the start (hidden too, head to head). */
  left: Contender;
  /** The value the player guesses against the left one. */
  right: Contender;
}

/** Whether the right value is higher or lower than the left one; head to head, "higher" means the right side wins. */
export type Guess = "higher" | "lower";

export function correctGuess(round: HigherLowerRound): Guess {
  return round.right.value > round.left.value ? "higher" : "lower";
}

export function formatValue(value: number, format: ValueFormat): string {
  if (format === "percent") return formatPercent(value);
  if (format === "decimal") return value.toFixed(2);
  return Math.round(value).toLocaleString("en-US");
}

/**
 * The stats every player of a day sees: seven full UTC days, ending two days before the puzzle. Recent matches are
 * still being ingested, and a number that moved during the day could flip an answer. The range is whole days, start
 * to end of day, the shape the analytics pages give a `date_range`, so a stats link shows exactly these matches.
 */
function statsDays(date: string) {
  const last = day.utc(date).subtract(2, "day").endOf("day");
  return { first: last.subtract(6, "day").startOf("day"), last };
}

export function statsWindow(date: string): { minUnixTimestamp: number; maxUnixTimestamp: number } {
  const { first, last } = statsDays(date);
  return { minUnixTimestamp: first.unix(), maxUnixTimestamp: last.unix() };
}

/** The day's window for people, e.g. "Sep 20–26", or "Aug 28–Sep 3" when it spans two months. */
export function statsWindowLabel(date: string): string {
  const { first, last } = statsDays(date);
  const end = first.month() === last.month() ? last.format("D") : last.format("MMM D");
  return `${first.format("MMM D")}–${end}`;
}

/** Every rank: the analytics pages' `min_rank` / `max_rank`, and the badge bounds the quiz queries with. */
export const STATS_RANKS = { min: 0, max: 116 } as const;

/** The day's window as an analytics page `date_range` search param. */
export function statsDateRange(date: string): string {
  const { first, last } = statsDays(date);
  return `${first.toISOString()}_${last.toISOString()}`;
}

/** The heroes whose ability order the day asks about, picked before any stats load so their queries can start. */
export function pickAbilityHeroes(heroIds: readonly number[], date: string): number[] {
  const rng = seededRandom(getModeSeed(date, "higher-lower:ability-heroes"));
  return seededShuffle(
    heroIds.toSorted((a, b) => a - b),
    rng,
  ).slice(0, ABILITY_ROUNDS);
}

export interface HigherLowerData {
  heroes: readonly { id: number; name: string }[];
  /** Hero abilities with a display name, keyed by id. */
  abilities: ReadonlyMap<number, { name: string; hero: number }>;
  heroStats: readonly AnalyticsHeroStats[];
  counters: readonly HeroCounterStats[];
  gameStats: AnalyticsGameStats | undefined;
  /** Ability orders of `pickAbilityHeroes()`, in the same order. */
  abilityOrders: readonly { heroId: number; rows: readonly AnalyticsAbilityOrderStats[] }[];
}

/** Heroes with fewer games in the window are left out, so a value is never the noise of a small sample. */
const MIN_HERO_MATCHES = 2000;
const MIN_MATCHUP_MATCHES = 500;
const MIN_ABILITY_ORDER_MATCHES = 500;
/** Below this relative gap two values read as the same number, however large the sample. */
const MIN_GAP = 0.03;
/**
 * How many standard errors apart two rates must be: |z| ≥ 3, about 99.7% confidence that the gap is real and not the
 * noise of which matches happened to be played. A win rate over 10,000 matches needs a gap of about two points.
 */
const MIN_Z = 3;

/** Which difficulty band a position falls in: rounds 1–3, 4–7 and 8–10. */
function bandIndex(position: number): 0 | 1 | 2 {
  if (position < 3) return 0;
  if (position < 7) return 1;
  return 2;
}

/** Rounds get harder as the run goes on: the relative gap between the two values narrows. */
function bandFor(position: number): readonly [number, number] {
  const bands = [
    [0.12, Number.POSITIVE_INFINITY],
    [0.05, 0.12],
    [MIN_GAP, 0.05],
  ] as const;
  return bands[bandIndex(position)];
}

function relativeGap(a: number, b: number): number {
  const mean = (Math.abs(a) + Math.abs(b)) / 2;
  return mean === 0 ? 0 : Math.abs(a - b) / mean;
}

type Pair = [Contender, Contender];

/** Two independent rates: a two-proportion z-test on their samples. Values without a sample pass. */
function rateZ(a: Contender, b: Contender): number {
  if (!a.sample || !b.sample) return Number.POSITIVE_INFINITY;
  const pooled = (a.value * a.sample + b.value * b.sample) / (a.sample + b.sample);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / a.sample + 1 / b.sample));
  return se === 0 ? 0 : Math.abs(a.value - b.value) / se;
}

/**
 * Whether a pair is worth asking about: the values differ enough to read as different and, for rates, significantly
 * so. Per-match averages carry no variance here; they come from samples of thousands of matches, where the gap alone
 * is the test.
 */
function isSignificant([a, b]: Pair): boolean {
  return relativeGap(a.value, b.value) >= MIN_GAP && rateZ(a, b) >= MIN_Z;
}

function contenderKey(contender: Contender): string {
  if (contender.kind === "hero") return `hero:${contender.heroId}`;
  if (contender.kind === "ability") return `ability:${contender.abilityId}`;
  return `source:${contender.name}`;
}

interface Picker {
  rng: () => number;
  band: readonly [number, number];
  /** Questions already asked today, so no pair comes up twice. */
  used: Set<string>;
}

/** Every pair of `contenders`. */
function pairsOf(contenders: readonly Contender[]): Pair[] {
  const pairs: Pair[] = [];
  for (let i = 0; i < contenders.length; i++) {
    for (let j = i + 1; j < contenders.length; j++) pairs.push([contenders[i], contenders[j]]);
  }
  return pairs;
}

/**
 * One of the significant `candidates` whose gap sits in the round's difficulty band, in seeded order; failing that,
 * the significant pair closest to the band. Which side is shown first is seeded too, so "higher" and "lower" are
 * equally likely.
 */
function pickPair(
  candidates: readonly Pair[],
  topic: string,
  { rng, band, used }: Picker,
  significant: (pair: Pair) => boolean = isSignificant,
): Pair | null {
  const keyOf = ([a, b]: Pair) => `${topic}|${[contenderKey(a), contenderKey(b)].toSorted().join("|")}`;
  const fresh = seededShuffle(
    candidates.filter((pair) => significant(pair) && !used.has(keyOf(pair))),
    rng,
  );
  if (fresh.length === 0) return null;

  const distance = ([a, b]: Pair) => {
    const gap = relativeGap(a.value, b.value);
    return gap < band[0] ? band[0] - gap : gap > band[1] ? gap - band[1] : 0;
  };
  let best = fresh[0];
  for (const pair of fresh) {
    if (distance(pair) === 0) {
      best = pair;
      break;
    }
    if (distance(pair) < distance(best)) best = pair;
  }
  used.add(keyOf(best));
  return rng() < 0.5 ? best : [best[1], best[0]];
}

type HeroStatDefinition = {
  topic: string;
  source: StatSource;
  stat: string;
  format: ValueFormat;
  value: (row: AnalyticsHeroStats, totalMatches: number) => number;
  /** For a rate, the matches it is measured over. */
  sample?: (row: AnalyticsHeroStats, totalMatches: number) => number;
  question: (left: string, right: string) => string;
};

const HERO_META_STATS: HeroStatDefinition[] = [
  {
    topic: "win-rate",
    source: { page: "hero-stats" },
    stat: "Win rate",
    format: "percent",
    value: (row) => row.wins / row.matches,
    sample: (row) => row.matches,
    question: (left, right) => `Is ${possessive(right)} win rate higher or lower than ${possessive(left)}?`,
  },
  {
    topic: "pick-rate",
    source: { page: "hero-stats" },
    stat: "Pick rate",
    format: "percent",
    // Twelve heroes per match, none twice: the share of matches a hero appears in.
    value: (row, total) => (12 * row.matches) / total,
    sample: (_, total) => total / 12,
    question: (left, right) => `Is ${possessive(right)} pick rate higher or lower than ${possessive(left)}?`,
  },
  {
    topic: "kills",
    source: { page: "hero-scoreboard" },
    stat: "Kills per match",
    format: "decimal",
    value: (row) => row.total_kills / row.matches,
    question: (left, right) => `Are ${possessive(right)} kills per match higher or lower than ${possessive(left)}?`,
  },
  {
    topic: "deaths",
    source: { page: "hero-scoreboard" },
    stat: "Deaths per match",
    format: "decimal",
    value: (row) => row.total_deaths / row.matches,
    question: (left, right) => `Are ${possessive(right)} deaths per match higher or lower than ${possessive(left)}?`,
  },
  {
    topic: "hero-damage",
    source: { page: "hero-scoreboard" },
    stat: "Hero damage per match",
    format: "number",
    value: (row) => row.total_player_damage / row.matches,
    question: (left, right) =>
      `Is ${possessive(right)} hero damage per match higher or lower than ${possessive(left)}?`,
  },
];

const HERO_ECONOMY_STATS: HeroStatDefinition[] = [
  {
    topic: "net-worth",
    source: { page: "hero-scoreboard" },
    stat: "Net worth at match end",
    format: "number",
    value: (row) => row.total_net_worth / row.matches,
    question: (left, right) =>
      `Is ${possessive(right)} net worth at match end higher or lower than ${possessive(left)}?`,
  },
  {
    topic: "last-hits",
    source: { page: "hero-scoreboard" },
    stat: "Last hits per match",
    format: "number",
    value: (row) => row.total_last_hits / row.matches,
    question: (left, right) => `Are ${possessive(right)} last hits per match higher or lower than ${possessive(left)}?`,
  },
  {
    topic: "denies",
    source: { page: "hero-scoreboard" },
    stat: "Denies per match",
    format: "decimal",
    value: (row) => row.total_denies / row.matches,
    question: (left, right) => `Are ${possessive(right)} denies per match higher or lower than ${possessive(left)}?`,
  },
];

/** Where an average player's souls come from; each source counts its orbs too. */
const SOUL_SOURCES: { name: string; phrase: string; keys: (keyof AnalyticsGameStats)[] }[] = [
  { name: "Hero kills", phrase: "hero kills", keys: ["avg_gold_player", "avg_gold_player_orbs"] },
  { name: "Lane troopers", phrase: "lane troopers", keys: ["avg_gold_lane_creep", "avg_gold_lane_creep_orbs"] },
  { name: "Jungle neutrals", phrase: "jungle camps", keys: ["avg_gold_neutral_creep", "avg_gold_neutral_creep_orbs"] },
  { name: "Objectives", phrase: "objectives", keys: ["avg_gold_boss", "avg_gold_boss_orb"] },
  { name: "Urn", phrase: "the Urn", keys: ["avg_gold_treasure"] },
  { name: "Breakables", phrase: "breakables", keys: ["avg_gold_breakable"] },
  { name: "Team bonus", phrase: "the team bonus", keys: ["avg_gold_team_bonus"] },
];

/** A source's name inside a sentence. */
function soulPhrase(name: string): string {
  return SOUL_SOURCES.find((source) => source.name === name)?.phrase ?? name.toLowerCase();
}

function heroContenders(data: HigherLowerData, definition: HeroStatDefinition): Contender[] {
  const names = new Map(data.heroes.map((hero) => [hero.id, hero.name]));
  const totalMatches = data.heroStats.reduce((sum, row) => sum + row.matches, 0);
  const contenders: Contender[] = [];
  for (const row of data.heroStats) {
    const name = names.get(row.hero_id);
    if (name == null || row.matches < MIN_HERO_MATCHES) continue;
    contenders.push({
      kind: "hero",
      heroId: row.hero_id,
      name,
      value: definition.value(row, totalMatches),
      sample: definition.sample?.(row, totalMatches),
    });
  }
  return contenders;
}

function heroStatRound(
  data: HigherLowerData,
  category: HigherLowerCategory,
  definitions: HeroStatDefinition[],
  picker: Picker,
): HigherLowerRound | null {
  for (const definition of seededShuffle([...definitions], picker.rng)) {
    const pair = pickPair(pairsOf(heroContenders(data, definition)), definition.topic, picker);
    if (!pair) continue;
    const [left, right] = pair;
    return {
      category,
      kind: "higher-lower",
      source: definition.source,
      stat: definition.stat,
      question: definition.question(left.name, right.name),
      format: definition.format,
      left,
      right,
    };
  }
  return null;
}

/**
 * Whether one hero really wins a matchup more often: both win rates come from the same matches, so it is a one-sample
 * test of the first hero's win rate against 50%.
 */
function isSignificantMatchup([a]: Pair): boolean {
  const n = a.sample ?? 0;
  if (n === 0 || relativeGap(a.value, 1 - a.value) < MIN_GAP) return false;
  return Math.abs(a.value - 0.5) / Math.sqrt(0.25 / n) >= MIN_Z;
}

/** Two heroes and who of them wins when they meet: each side's value is its win rate in that matchup. */
function matchupRound(data: HigherLowerData, picker: Picker): HigherLowerRound | null {
  const names = new Map(data.heroes.map((hero) => [hero.id, hero.name]));
  const pairs: Pair[] = [];
  // Each matchup is in the stats from both sides; the lower hero id's row stands for it.
  for (const row of data.counters) {
    const name = names.get(row.hero_id);
    const enemy = names.get(row.enemy_hero_id);
    if (row.hero_id >= row.enemy_hero_id || name == null || enemy == null) continue;
    if (row.matches_played < MIN_MATCHUP_MATCHES) continue;
    const winRate = row.wins / row.matches_played;
    const sample = row.matches_played;
    pairs.push([
      { kind: "hero", heroId: row.hero_id, name, value: winRate, sample },
      { kind: "hero", heroId: row.enemy_hero_id, name: enemy, value: 1 - winRate, sample },
    ]);
  }
  const pair = pickPair(pairs, "matchup", picker, isSignificantMatchup);
  if (!pair) return null;
  const [left, right] = pair;
  return {
    category: "matchups",
    kind: "head-to-head",
    source: { page: "matchup", heroId: left.kind === "hero" ? left.heroId : 0 },
    stat: "Win rate in this matchup",
    question: `${left.name} vs ${right.name}: who wins this matchup more often?`,
    format: "percent",
    left,
    right,
  };
}

function soulSourceRound(data: HigherLowerData, picker: Picker): HigherLowerRound | null {
  const stats = data.gameStats;
  if (!stats) return null;
  const contenders: Contender[] = SOUL_SOURCES.map((source) => ({
    kind: "source",
    name: source.name,
    value: source.keys.reduce((sum, key) => sum + (stats[key] ?? 0), 0),
  }));
  const pair = pickPair(pairsOf(contenders), "soul-source", picker);
  if (!pair) return null;
  const [left, right] = pair;
  return {
    category: "economy",
    kind: "higher-lower",
    source: { page: "economy" },
    stat: "Souls per player per match",
    question: `Are the souls from ${soulPhrase(right.name)} higher or lower than from ${soulPhrase(left.name)}?`,
    format: "number",
    left,
    right,
  };
}

function economyRound(data: HigherLowerData, picker: Picker): HigherLowerRound | null {
  // One in three economy rounds is about where souls come from, the rest compare heroes.
  if (picker.rng() < 1 / 3) {
    return soulSourceRound(data, picker) ?? heroStatRound(data, "economy", HERO_ECONOMY_STATS, picker);
  }
  return heroStatRound(data, "economy", HERO_ECONOMY_STATS, picker) ?? soulSourceRound(data, picker);
}

/**
 * Abilities almost nobody maxes first are left out: 0.6% against 89% is a giveaway, not a question. (How many players
 * max an ability by the end is not asked either: nearly all do, so it measures how long matches last.)
 */
const MIN_ABILITY_SHARE = 0.03;

/** An ability is maxed once it is unlocked and upgraded three times. */
const MAXED_COUNT = 4;

type AbilityOrderDefinition = {
  topic: string;
  stat: string;
  /** The abilities a row counts for. */
  count: (order: readonly number[]) => number[];
  question: (hero: string, left: string, right: string) => string;
};

const ABILITY_ORDER_STATS: AbilityOrderDefinition[] = [
  {
    topic: "maxed-first",
    stat: "Share of players who max it first",
    count: (order) => {
      const counts = new Map<number, number>();
      for (const id of order) {
        const count = (counts.get(id) ?? 0) + 1;
        counts.set(id, count);
        if (count === MAXED_COUNT) return [id];
      }
      return [];
    },
    // The hero is on the card above the board; naming it here too wrapped the question to four lines on a phone.
    question: (_hero, left, right) =>
      `Is ${possessive(right)} max-first share higher or lower than ${possessive(left)}?`,
  },
];

function abilityRound(
  data: HigherLowerData,
  order: HigherLowerData["abilityOrders"][number] | undefined,
  picker: Picker,
): HigherLowerRound | null {
  if (!order) return null;
  const hero = data.heroes.find((candidate) => candidate.id === order.heroId);
  // Only the abilities that are levelled: an innate one never shows up in an order and would always be a free 0%.
  const levelled = new Set(order.rows.flatMap((row) => row.abilities));
  const abilityIds = [...data.abilities]
    .filter(([id, ability]) => ability.hero === order.heroId && levelled.has(id))
    .map(([id]) => id);
  const total = order.rows.reduce((sum, row) => sum + row.matches, 0);
  if (!hero || abilityIds.length < 2 || total < MIN_ABILITY_ORDER_MATCHES) return null;

  for (const definition of seededShuffle([...ABILITY_ORDER_STATS], picker.rng)) {
    const matches = new Map<number, number>();
    for (const row of order.rows) {
      for (const id of definition.count(row.abilities)) matches.set(id, (matches.get(id) ?? 0) + row.matches);
    }
    const contenders: Contender[] = abilityIds
      .map((abilityId): Contender => ({
        kind: "ability",
        abilityId,
        name: data.abilities.get(abilityId)?.name ?? "",
        value: (matches.get(abilityId) ?? 0) / total,
        sample: total,
      }))
      .filter((contender) => contender.value >= MIN_ABILITY_SHARE);
    const pair = pickPair(pairsOf(contenders), `${definition.topic}:${order.heroId}`, picker);
    if (!pair) continue;
    const [left, right] = pair;
    return {
      category: "abilities",
      kind: "higher-lower",
      source: { page: "abilities", heroId: hero.id },
      subject: { heroId: hero.id, name: hero.name },
      stat: definition.stat,
      question: definition.question(hero.name, left.name, right.name),
      format: "percent",
      left,
      right,
    };
  }
  return null;
}

/**
 * The day's ten rounds: three on the hero meta, three matchups, two on the soul economy and two on ability order,
 * shuffled together and getting harder as they go. Only significant gaps are asked about. The same date and the same
 * stats give everyone the same run. A category without enough data for its round falls back to a hero meta round.
 */
export function buildRounds(data: HigherLowerData, date: string): HigherLowerRound[] {
  const order = seededShuffle([...ROUND_PLAN], seededRandom(getModeSeed(date, "higher-lower")));
  const used = new Set<string>();
  const rounds: HigherLowerRound[] = [];
  let abilityIndex = 0;
  for (const [position, category] of order.entries()) {
    // Each round has its own seed, so a round that falls back does not reshuffle the ones after it.
    const picker: Picker = {
      rng: seededRandom(getModeSeed(date, `higher-lower:${position}`)),
      band: bandFor(position),
      used,
    };
    let round: HigherLowerRound | null = null;
    if (category === "heroes") round = heroStatRound(data, "heroes", HERO_META_STATS, picker);
    else if (category === "matchups") round = matchupRound(data, picker);
    else if (category === "economy") round = economyRound(data, picker);
    else round = abilityRound(data, data.abilityOrders[abilityIndex++], picker);
    round ??= heroStatRound(data, "heroes", HERO_META_STATS, picker);
    if (round) rounds.push(round);
  }
  return rounds;
}

/**
 * What the answer revealed, the gap included; the route puts "Correct" or "Wrong" in front. One phrasing per kind:
 * - a rate: "Abrams: 52.1%, 1.3 points below Mirage's 53.4%." (percentage points);
 * - ability order: "Calico players max Gloom Bombs first 5.7% of the time, 82.2 points below Return to Shadows (87.9%).";
 * - an average: "Abrams: 42,443, 5% below Mirage's 44,906." (relative to the shown value);
 * - a soul source, in the question's phrases: "Souls from jungle camps: 9,120, 12% above those from objectives (8,143).";
 * - head to head: "Haze wins 54.2% of the matches where Haze and Vindicta face each other."
 */
export function revealSentence(round: HigherLowerRound): string {
  const { left, right, format } = round;
  if (round.kind === "head-to-head") {
    const winner = right.value > left.value ? right : left;
    return `${winner.name} wins ${formatValue(winner.value, format)} of the matches where ${left.name} and ${right.name} face each other.`;
  }
  const direction = right.value > left.value ? "above" : "below";
  const rightValue = formatValue(right.value, format);
  const leftValue = formatValue(left.value, format);
  if (format === "percent") {
    // From the shown, rounded values, so 26.5% and 13.3% are 13.2 points apart, as the reader would work it out.
    const tenths = (value: number) => Math.round(value * 1000);
    const points = `${(Math.abs(tenths(right.value) - tenths(left.value)) / 10).toFixed(1)} points ${direction}`;
    if (round.subject) {
      return `${round.subject.name} players max ${right.name} first ${rightValue} of the time, ${points} ${left.name} (${leftValue}).`;
    }
    return `${right.name}: ${rightValue}, ${points} ${possessive(left.name)} ${leftValue}.`;
  }
  const relative = left.value === 0 ? 0 : Math.round((Math.abs(right.value - left.value) / Math.abs(left.value)) * 100);
  if (right.kind === "source") {
    // In the question's words: "jungle camps", not the card's "Jungle neutrals".
    return `Souls from ${soulPhrase(right.name)}: ${rightValue}, ${relative}% ${direction} those from ${soulPhrase(left.name)} (${leftValue}).`;
  }
  return `${right.name}: ${rightValue}, ${relative}% ${direction} ${possessive(left.name)} ${leftValue}.`;
}

function isCorrect(rounds: readonly HigherLowerRound[], answers: readonly (Guess | null)[], index: number): boolean {
  return answers[index] != null && answers[index] === correctGuess(rounds[index]);
}

/** One square per round for the share text, like the other daily games. */
export function resultGrid(rounds: readonly HigherLowerRound[], answers: readonly (Guess | null)[]): string {
  return rounds.map((_, i) => (isCorrect(rounds, answers, i) ? "🟩" : "🟥")).join("");
}

/** The share squares grouped by difficulty band, "🟩🟩🟩 🟩🟥🟩🟩 🟥🟩🟩", so the grid shows where the run got hard. */
export function shareGrid(rounds: readonly HigherLowerRound[], answers: readonly (Guess | null)[]): string {
  const groups: string[] = ["", "", ""];
  for (const i of rounds.keys()) groups[bandIndex(i)] += isCorrect(rounds, answers, i) ? "🟩" : "🟥";
  return groups.filter(Boolean).join(" ");
}

/** The longest run of correct answers; an unanswered round breaks it. */
export function bestStreak(rounds: readonly HigherLowerRound[], answers: readonly (Guess | null)[]): number {
  let best = 0;
  let run = 0;
  for (const i of rounds.keys()) {
    run = isCorrect(rounds, answers, i) ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

/** The correct answers in a row ending at round `upToIndex`, the latest answered one: 0 when that one was wrong. */
export function currentStreak(
  rounds: readonly HigherLowerRound[],
  answers: readonly (Guess | null)[],
  upToIndex: number,
): number {
  let run = 0;
  for (let i = Math.min(upToIndex, rounds.length - 1); i >= 0 && isCorrect(rounds, answers, i); i--) run += 1;
  return run;
}
