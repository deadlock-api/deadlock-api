import type { Rank } from "deadlock_api_client";

const SUBTIERS = [1, 2, 3, 4, 5, 6] as const;

export interface SubtierInfo {
  name: string;
  subtier: number;
  large?: string;
  large_webp?: string;
  color?: string;
}

export function extractBadgeMap(ranks: Rank[]): Map<number, SubtierInfo> {
  const badgeMap = new Map<number, SubtierInfo>();
  ranks.forEach((rank) => {
    const tier = rank.tier;
    if (tier < 1) return;
    for (const subtier of SUBTIERS) {
      const badge = tier * 10 + subtier;
      badgeMap.set(badge, {
        name: rank.name,
        subtier,
        large: rank.images.large ?? undefined,
        large_webp: rank.images.large_webp ?? undefined,
        color: rank.color ?? undefined,
      });
    }
  });
  return badgeMap;
}
