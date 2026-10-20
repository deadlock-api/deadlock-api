import type { HeroBanStats } from "deadlock_api_client";

/**
 * The matches with ban data in each bucket. Every row of a bucket repeats the count, so it is taken once per bucket.
 * The bans don't divide into matches by a fixed count: a ranked match has 3 bans, an unranked match 2.
 */
export function banMatchesByBucket(banData: readonly HeroBanStats[]): Map<number, number> {
  const matches = new Map<number, number>();
  for (const row of banData) matches.set(row.bucket, row.matches);
  return matches;
}

/** The matches with ban data across every bucket. */
export function totalBanMatches(banData: readonly HeroBanStats[]): number {
  let total = 0;
  for (const matches of banMatchesByBucket(banData).values()) total += matches;
  return total;
}

export function computeBanRates(banData: readonly HeroBanStats[]): Map<number, number> {
  const totalMatches = totalBanMatches(banData);
  const heroBans = new Map<number, number>();
  for (const row of banData) heroBans.set(row.hero_id, (heroBans.get(row.hero_id) ?? 0) + row.bans);
  const map = new Map<number, number>();
  for (const [heroId, bans] of heroBans) {
    map.set(heroId, totalMatches > 0 ? bans / totalMatches : 0);
  }
  return map;
}

export function computeBanRatesByBucket(banData: readonly HeroBanStats[]): Map<number, Map<number, number>> {
  const bucketMatches = banMatchesByBucket(banData);
  const bucketHeroBans = new Map<number, Map<number, number>>();
  for (const row of banData) {
    if (!bucketHeroBans.has(row.bucket)) bucketHeroBans.set(row.bucket, new Map());
    const heroMap = bucketHeroBans.get(row.bucket)!;
    heroMap.set(row.hero_id, (heroMap.get(row.hero_id) ?? 0) + row.bans);
  }
  const result = new Map<number, Map<number, number>>();
  for (const [bucket, heroMap] of bucketHeroBans) {
    const totalMatches = bucketMatches.get(bucket) ?? 0;
    const rateMap = new Map<number, number>();
    for (const [heroId, bans] of heroMap) {
      rateMap.set(heroId, totalMatches > 0 ? bans / totalMatches : 0);
    }
    result.set(bucket, rateMap);
  }
  return result;
}
