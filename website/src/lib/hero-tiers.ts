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

export interface HeroTierInput {
  heroId: number;
  wins: number;
  matches: number;
}

export interface RankedHero {
  heroId: number;
  tier: Tier;
  score: number;
  winRate: number;
  pickRate: number;
  matches: number;
}

/**
 * Every hero with its tier, best score first. Pick rates are per match, `pickRateMultiplier` heroes a match (12, or 8
 * in Street Brawl); `banRates` joins the score only when it has a rate for every hero, as in the Overall table.
 */
export function rankHeroes(
  rows: readonly HeroTierInput[],
  pickRateMultiplier: number,
  banRates?: ReadonlyMap<number, number>,
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
  return played
    .map((row, i) => ({
      heroId: row.heroId,
      tier: tierOf(scores[i]),
      score: scores[i],
      winRate: inputs[i].winrate,
      pickRate: inputs[i].pickrate,
      matches: row.matches,
    }))
    .sort((a, b) => b.score - a.score);
}
