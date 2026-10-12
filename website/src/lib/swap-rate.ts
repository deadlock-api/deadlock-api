import type { HeroSwapStats } from "deadlock_api_client";

/** One hero's pre-game swaps, over the players whose pre-game hero the demo recorded. */
export interface HeroSwapRates {
  /** Players on the hero; the sample the swap-in rate rests on. */
  matches: number;
  swappedIn: number;
  /** Share of the hero's players who swapped onto it. */
  swapInRate: number;
  /** Win rate of those who swapped onto it, undefined when nobody did. */
  swapInWinRate?: number;
  /** Players who had the hero locked before the swap window. */
  pregamePicks: number;
  /** Share of those who swapped away from it. */
  swapAwayRate: number;
}

/** Each hero's swap rates, summed over every bucket of the response. */
export function computeSwapRates(swapData: HeroSwapStats[]): Map<number, HeroSwapRates> {
  const totals = new Map<number, Omit<HeroSwapStats, "hero_id" | "bucket">>();
  for (const row of swapData) {
    const total = totals.get(row.hero_id) ?? {
      matches: 0,
      swapped_in: 0,
      swapped_in_wins: 0,
      pregame_picks: 0,
      swapped_away: 0,
    };
    total.matches += row.matches;
    total.swapped_in += row.swapped_in;
    total.swapped_in_wins += row.swapped_in_wins;
    total.pregame_picks += row.pregame_picks;
    total.swapped_away += row.swapped_away;
    totals.set(row.hero_id, total);
  }
  const map = new Map<number, HeroSwapRates>();
  for (const [heroId, t] of totals) {
    map.set(heroId, {
      matches: t.matches,
      swappedIn: t.swapped_in,
      swapInRate: t.matches > 0 ? t.swapped_in / t.matches : 0,
      swapInWinRate: t.swapped_in > 0 ? t.swapped_in_wins / t.swapped_in : undefined,
      pregamePicks: t.pregame_picks,
      swapAwayRate: t.pregame_picks > 0 ? t.swapped_away / t.pregame_picks : 0,
    });
  }
  return map;
}
