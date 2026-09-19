import type { AnalyticsHeroStats, HeroBanStats } from "deadlock_api_client";

import type { StatTrendPoint } from "~/components/analytics/StatTrendChart";
import type { StatFormat } from "~/components/games-page/stat-definitions";
import { BANS_PER_MATCH, computeBanRatesByBucket } from "~/lib/ban-rate";
import { computeResiduals, computeZScores } from "~/lib/hero-scoring";

export const HERO_TABLE_TRENDS = {
  winRate: { label: "Win Rate", format: "percent" },
  pickRate: { label: "Pick Rate", format: "percent" },
  banRate: { label: "Ban Rate", format: "percent" },
  presence: { label: "Presence", format: "percent" },
  zScore: { label: "Z-Score", format: "decimal2" },
  residual: { label: "Over/Under", format: "percent" },
} as const satisfies Record<string, { label: string; format: StatFormat }>;

export type HeroTableTrend = keyof typeof HERO_TABLE_TRENDS;

/** Recompute the table's statistics within each bucket using the entire filtered roster. */
export function buildHeroTableTrend({
  heroes,
  bans,
  heroId,
  stat,
  pickrateMultiplier,
  normalizedPickrate,
  minMatchesPerBucket = 0,
}: {
  heroes: AnalyticsHeroStats[];
  bans: HeroBanStats[];
  heroId: number;
  stat: HeroTableTrend;
  pickrateMultiplier: number;
  normalizedPickrate: boolean;
  minMatchesPerBucket?: number;
}): StatTrendPoint[] {
  const banRates = computeBanRatesByBucket(bans);
  const banSamples = new Map<number, number>();
  for (const row of bans) banSamples.set(row.bucket, (banSamples.get(row.bucket) ?? 0) + row.bans / BANS_PER_MATCH);
  for (const [bucket, matches] of banSamples) {
    if (matches < minMatchesPerBucket) banRates.delete(bucket);
  }
  if (stat === "banRate") {
    return [...banRates]
      .sort(([a], [b]) => a - b)
      .map(([bucket, rates]) => ({ date: bucket * 1000, value: rates.get(heroId) ?? 0 }));
  }

  const buckets = new Map<number, AnalyticsHeroStats[]>();
  for (const row of heroes) {
    if (row.matches <= 0) continue;
    const rows = buckets.get(row.bucket) ?? [];
    rows.push(row);
    buckets.set(row.bucket, rows);
  }

  return [...buckets]
    .sort(([a], [b]) => a - b)
    .map(([bucket, rows]) => {
      const index = rows.findIndex((row) => row.hero_id === heroId);
      const row = rows[index];
      if (!row || row.matches < minMatchesPerBucket) return { date: bucket * 1000, value: null };
      const totalMatches = rows.reduce((total, hero) => total + hero.matches, 0);
      const rates = banRates.get(bucket);
      const pickrate = (pickrateMultiplier * row.matches) / totalMatches;
      let value: number | null;
      switch (stat) {
        case "winRate":
          value = row.wins / row.matches;
          break;
        case "pickRate":
          value = normalizedPickrate ? row.matches / Math.max(...rows.map((hero) => hero.matches)) : pickrate;
          break;
        case "presence":
          value = rates ? pickrate + (rates.get(heroId) ?? 0) : null;
          break;
        case "zScore":
        case "residual": {
          const inputs = rows.map((hero) => ({
            winrate: hero.wins / hero.matches,
            pickrate: (pickrateMultiplier * hero.matches) / totalMatches,
            banrate: rates ? (rates.get(hero.hero_id) ?? 0) : undefined,
            matches: hero.matches,
          }));
          value = stat === "zScore" ? computeZScores(inputs)[index] : computeResiduals(inputs).residuals[index];
          break;
        }
      }
      return { date: bucket * 1000, value, matches: row.matches };
    });
}
