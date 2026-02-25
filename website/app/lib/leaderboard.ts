import type { RankV2 } from "assets_deadlock_api_client";

const SUBTIERS = [1, 2, 3, 4, 5, 6] as const;

export interface SubtierInfo {
  name: string;
  subtier: number;
  large?: string;
  large_webp?: string;
  small?: string;
  small_webp?: string;
  color?: string;
}

export function extractBadgeMap(ranks: RankV2[]): Map<number, SubtierInfo> {
  const badgeMap = new Map<number, SubtierInfo>();
  ranks.forEach((rank) => {
    const tier = rank.tier;
    if (tier < 1) return;
    for (const subtier of SUBTIERS) {
      const badge = tier * 10 + subtier;
      const small = rank.images[`small_subrank${subtier}`];
      const small_webp = rank.images[`small_subrank${subtier}_webp`];
      const large = rank.images[`large_subrank${subtier}`];
      const large_webp = rank.images[`large_subrank${subtier}_webp`];
      badgeMap.set(badge, {
        name: rank.name,
        subtier,
        large: large ?? undefined,
        large_webp: large_webp ?? undefined,
        small: small ?? undefined,
        small_webp: small_webp ?? undefined,
        color: rank.color ?? undefined,
      });
    }
  });
  return badgeMap;
}
