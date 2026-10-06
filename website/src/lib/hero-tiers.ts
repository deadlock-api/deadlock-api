import type { AnalyticsHeroStats } from "deadlock_api_client";

import { computeZScores } from "~/lib/hero-scoring";

export const TIERS = ["s", "a", "b", "c", "d"] as const;
export type Tier = (typeof TIERS)[number];

/**
 * The lowest tier score of each tier but the last. The score is the Overall table's (`computeZScores`), a weighted sum
 * of standardized win, pick and ban rates, so the cuts sit in standard deviations around the average hero: a balanced
 * patch puts most heroes in B and only real outliers in S and D.
 */
const TIER_FLOORS: readonly [Tier, number][] = [
  ["s", 1],
  ["a", 0.35],
  ["b", -0.35],
  ["c", -1],
];

export function tierOf(score: number): Tier {
  return TIER_FLOORS.find(([, floor]) => score >= floor)?.[0] ?? "d";
}

/** The match totals of one hero that the tier list ranks on, as the hero stats endpoint sums them. */
export type HeroTierInput = { heroId: number } & Pick<
  AnalyticsHeroStats,
  | "wins"
  | "matches"
  | "total_kills"
  | "total_deaths"
  | "total_assists"
  | "total_net_worth"
  | "total_last_hits"
  | "total_denies"
  | "total_player_damage"
  | "total_player_damage_taken"
  | "total_boss_damage"
  | "total_shots_hit"
  | "total_shots_missed"
>;

export interface TierMetricDefinition {
  label: string;
  group: "Draft" | "Combat" | "Economy";
  /** How a reading prints under a tile. */
  format: "percent" | "decimal" | "integer";
  /** Fewer is better (deaths): the fewest rank highest. */
  lowerIsBetter?: boolean;
  /** Measures the soul economy, which Street Brawl does not have. */
  economy?: boolean;
  /** Needs ban data, which Street Brawl does not have. */
  bans?: boolean;
}

/**
 * What a tier list can rank by: the combined tier score (the default), one of its rates, or a per-match average.
 * Every one but the score is standardized across heroes, so the same tier cuts apply.
 */
export const TIER_METRIC_DEFINITIONS = {
  score: { label: "Tier score", group: "Draft", format: "decimal" },
  winRate: { label: "Win rate", group: "Draft", format: "percent" },
  pickRate: { label: "Pick rate", group: "Draft", format: "percent" },
  banRate: { label: "Ban rate", group: "Draft", format: "percent", bans: true },
  kills: { label: "Kills", group: "Combat", format: "decimal" },
  deaths: { label: "Deaths", group: "Combat", format: "decimal", lowerIsBetter: true },
  assists: { label: "Assists", group: "Combat", format: "decimal" },
  kda: { label: "KDA", group: "Combat", format: "decimal" },
  heroDamage: { label: "Hero damage", group: "Combat", format: "integer" },
  damageTaken: { label: "Damage taken", group: "Combat", format: "integer" },
  accuracy: { label: "Accuracy", group: "Combat", format: "percent" },
  souls: { label: "Souls", group: "Economy", format: "integer", economy: true },
  lastHits: { label: "Last hits", group: "Economy", format: "decimal", economy: true },
  denies: { label: "Denies", group: "Economy", format: "decimal", economy: true },
  objectiveDamage: { label: "Objective damage", group: "Economy", format: "integer" },
} as const satisfies Record<string, TierMetricDefinition>;

export type TierMetric = keyof typeof TIER_METRIC_DEFINITIONS;
export const TIER_METRICS = Object.keys(TIER_METRIC_DEFINITIONS) as TierMetric[];

/** A hero's reading of a per-match metric; the draft metrics come from the whole roster, not one hero. */
function perMatch(row: HeroTierInput, metric: TierMetric): number | undefined {
  const m = row.matches;
  switch (metric) {
    case "kills":
      return row.total_kills / m;
    case "deaths":
      return row.total_deaths / m;
    case "assists":
      return row.total_assists / m;
    case "kda":
      return (row.total_kills + row.total_assists) / Math.max(row.total_deaths, 1);
    case "heroDamage":
      return row.total_player_damage / m;
    case "damageTaken":
      return row.total_player_damage_taken / m;
    case "accuracy": {
      const shots = row.total_shots_hit + row.total_shots_missed;
      return shots > 0 ? row.total_shots_hit / shots : 0;
    }
    case "souls":
      return row.total_net_worth / m;
    case "lastHits":
      return row.total_last_hits / m;
    case "denies":
      return row.total_denies / m;
    case "objectiveDamage":
      return row.total_boss_damage / m;
    default:
      return undefined;
  }
}

export interface RankedHero {
  heroId: number;
  tier: Tier;
  /** The tier score, whatever the list is ranked by. */
  score: number;
  /** What the tier and the order come from: the tier score, or the chosen metric standardized across heroes. */
  standing: number;
  winRate: number;
  pickRate: number;
  banRate?: number;
  matches: number;
  /** The hero's reading of the metric the list is ranked by. */
  reading: number;
}

/** Standard deviations from the mean, as `computeZScores` measures its parts. */
function standardize(values: readonly number[]): number[] {
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const sd = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length) || 1;
  return values.map((v) => (v - mean) / sd);
}

/**
 * Every hero with its tier, best first. Pick rates are per match, `pickRateMultiplier` heroes a match (12, or 8 in
 * Street Brawl); `banRates` joins the score only when it has a rate for every hero, as in the Overall table.
 * `metric` ranks by one rate or per-match average alone, standardized so the same tier cuts apply; ban rate without
 * bans falls back to the tier score.
 */
export function rankHeroes(
  rows: readonly HeroTierInput[],
  pickRateMultiplier: number,
  banRates?: ReadonlyMap<number, number>,
  metric: TierMetric = "score",
): RankedHero[] {
  const played = rows.filter((row) => row.matches > 0);
  const total = played.reduce((sum, row) => sum + row.matches, 0);
  if (total === 0) return [];
  const withBans = banRates != null && banRates.size > 0;
  const inputs = played.map((row) => ({
    winrate: row.wins / row.matches,
    pickrate: (pickRateMultiplier * row.matches) / total,
    banrate: withBans ? (banRates.get(row.heroId) ?? 0) : undefined,
  }));
  const scores = computeZScores(inputs);
  const effective: TierMetric = metric === "banRate" && !withBans ? "score" : metric;
  const readings = played.map((row, i) => {
    if (effective === "score") return scores[i];
    if (effective === "winRate") return inputs[i].winrate;
    if (effective === "pickRate") return inputs[i].pickrate;
    if (effective === "banRate") return inputs[i].banrate ?? 0;
    return perMatch(row, effective) ?? 0;
  });
  const definition: TierMetricDefinition = TIER_METRIC_DEFINITIONS[effective];
  const standings =
    effective === "score" ? scores : standardize(readings).map((z) => (definition.lowerIsBetter ? -z : z));
  return played
    .map((row, i) => ({
      heroId: row.heroId,
      tier: tierOf(standings[i]),
      score: scores[i],
      standing: standings[i],
      winRate: inputs[i].winrate,
      pickRate: inputs[i].pickrate,
      banRate: inputs[i].banrate,
      matches: row.matches,
      reading: readings[i],
    }))
    .sort((a, b) => b.standing - a.standing);
}
