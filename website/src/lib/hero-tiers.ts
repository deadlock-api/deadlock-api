/**
 * The hero tier list: every hero placed in S, A, B, C or D by how far its win rate sits above or below the average,
 * after accounting for how many matches that win rate rests on.
 *
 * 1. Average: p = total wins / total matches over the heroes in the sample (about 50%).
 * 2. True spread between heroes, tau: how much the heroes' win rates differ beyond what coin-flip noise alone would
 *    produce at each hero's match count (the DerSimonian-Laird estimator, which weights each hero by its matches so
 *    that a thin sample cannot inflate it).
 * 3. Shrinkage (empirical Bayes): each hero's win rate is pulled towards p in proportion to how thin its sample is,
 *    shrunk = (wins + k * p) / (matches + k) with k = p(1 - p) / tau^2. A hero on 200 matches moves a lot; one on
 *    200,000 barely moves.
 * 4. Score: the shrunk win rate's distance from p in units of tau. S is one spread or more above average, D one or
 *    more below; when the data shows no real spread (tau = 0) every hero is B.
 */

export const TIERS = ["S", "A", "B", "C", "D"] as const;
export type Tier = (typeof TIERS)[number];

/** Lower bound of each tier's score, best tier first; D takes everything below C. */
export const TIER_THRESHOLDS: Readonly<Record<Exclude<Tier, "D">, number>> = { S: 1, A: 0.4, B: -0.4, C: -1 };

export interface HeroTierInput {
  heroId: number;
  wins: number;
  matches: number;
}

export interface HeroTierEntry {
  heroId: number;
  tier: Tier;
  /** Standardised distance of the shrunk win rate from the average, in true-spread units. */
  score: number;
  winRate: number;
  shrunkWinRate: number;
  matches: number;
  /** Share of all hero picks, before the per-match multiplier. */
  share: number;
}

export interface HeroTierResult {
  /** Best score first. */
  entries: HeroTierEntry[];
  averageWinRate: number;
  /** Estimated standard deviation of true hero win rates. */
  spread: number;
  totalMatches: number;
}

export function tierOfScore(score: number): Tier {
  if (score >= TIER_THRESHOLDS.S) return "S";
  if (score >= TIER_THRESHOLDS.A) return "A";
  if (score > TIER_THRESHOLDS.B) return "B";
  if (score > TIER_THRESHOLDS.C) return "C";
  return "D";
}

/** DerSimonian-Laird: the excess of the weighted squared deviations over their expectation under noise alone. */
function betweenHeroVariance(heroes: readonly HeroTierInput[], average: number, noise: number): number {
  const weights = heroes.map((row) => row.matches / noise);
  const sumW = weights.reduce((sum, w) => sum + w, 0);
  const sumW2 = weights.reduce((sum, w) => sum + w * w, 0);
  const q = heroes.reduce((sum, row, i) => sum + weights[i] * (row.wins / row.matches - average) ** 2, 0);
  return Math.max(0, (q - (heroes.length - 1)) / (sumW - sumW2 / sumW));
}

export function computeHeroTiers(rows: readonly HeroTierInput[]): HeroTierResult {
  const heroes = rows.filter((row) => row.matches > 0);
  const totalMatches = heroes.reduce((sum, row) => sum + row.matches, 0);
  if (heroes.length === 0) return { entries: [], averageWinRate: 0, spread: 0, totalMatches: 0 };

  const n = heroes.length;
  const average = heroes.reduce((sum, row) => sum + row.wins, 0) / totalMatches;
  const noise = average * (1 - average);
  const trueVariance = n > 1 && noise > 0 ? betweenHeroVariance(heroes, average, noise) : 0;
  const spread = Math.sqrt(trueVariance);
  // Prior strength in matches: how many average games each hero's record is blended with.
  const k = spread > 0 ? noise / trueVariance : 0;

  const entries = heroes.map((row): HeroTierEntry => {
    const winRate = row.wins / row.matches;
    const shrunkWinRate = spread > 0 ? (row.wins + k * average) / (row.matches + k) : average;
    const score = spread > 0 ? (shrunkWinRate - average) / spread : 0;
    return {
      heroId: row.heroId,
      tier: tierOfScore(score),
      score,
      winRate,
      shrunkWinRate,
      matches: row.matches,
      share: row.matches / totalMatches,
    };
  });
  entries.sort((a, b) => b.score - a.score || b.matches - a.matches);

  return { entries, averageWinRate: average, spread, totalMatches };
}

/** The entries of each tier, S first, every tier present even when empty. */
export function groupByTier(entries: readonly HeroTierEntry[]): { tier: Tier; entries: HeroTierEntry[] }[] {
  return TIERS.map((tier) => ({ tier, entries: entries.filter((entry) => entry.tier === tier) }));
}
