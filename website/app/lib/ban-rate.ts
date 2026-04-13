import type { HeroBanStats } from "deadlock_api_client";

export const BANS_PER_MATCH = 2;

export function computeBanRates(banData: HeroBanStats[]): Map<number, number> {
  let totalBans = 0;
  for (const row of banData) totalBans += row.bans;
  const totalMatches = totalBans / BANS_PER_MATCH;
  const map = new Map<number, number>();
  for (const row of banData) {
    map.set(row.hero_id, totalMatches > 0 ? row.bans / totalMatches : 0);
  }
  return map;
}

export function computeBanRatesByBucket(banData: HeroBanStats[]): Map<number, Map<number, number>> {
  const bucketTotals = new Map<number, number>();
  const bucketHeroBans = new Map<number, Map<number, number>>();
  for (const row of banData) {
    bucketTotals.set(row.bucket, (bucketTotals.get(row.bucket) ?? 0) + row.bans);
    if (!bucketHeroBans.has(row.bucket)) bucketHeroBans.set(row.bucket, new Map());
    const heroMap = bucketHeroBans.get(row.bucket)!;
    heroMap.set(row.hero_id, (heroMap.get(row.hero_id) ?? 0) + row.bans);
  }
  const result = new Map<number, Map<number, number>>();
  for (const [bucket, heroMap] of bucketHeroBans) {
    const totalMatches = (bucketTotals.get(bucket) ?? 0) / BANS_PER_MATCH;
    const rateMap = new Map<number, number>();
    for (const [heroId, bans] of heroMap) {
      rateMap.set(heroId, totalMatches > 0 ? bans / totalMatches : 0);
    }
    result.set(bucket, rateMap);
  }
  return result;
}
