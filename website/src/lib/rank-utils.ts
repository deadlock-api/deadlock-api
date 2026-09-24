import type { Rank } from "deadlock_api_client";

export function getRankImageUrl(
  rank: Rank | undefined,
  format: "png" | "webp" = "webp",
  subrank?: number,
): string | undefined | null {
  if (!rank) return null;
  if (subrank && rank.tier > 0) {
    const webp = rank.images[`large_subrank${subrank}_webp` as keyof typeof rank.images];
    const png = rank.images[`large_subrank${subrank}` as keyof typeof rank.images];
    const url = format === "webp" ? (webp ?? png) : png;
    if (url) return url;
  }
  return format === "webp" ? (rank.images.large_webp ?? rank.images.large) : rank.images.large;
}

export function getRankLabel(rank: Rank, subrank: number): string {
  return rank.tier === 0 ? rank.name : `${rank.name} ${subrank}`;
}

/** The highest badge there is (Eternus 6): a rank range that ends there has no upper bound. */
export const MAX_BADGE = 116;

/** "Phantom 1" for badge 91, named from the ranks asset (tier = badge / 10, subrank = badge % 10). */
export function badgeLabel(ranks: readonly Rank[] | undefined, badge: number): string {
  const tier = Math.floor(badge / 10);
  const rank = ranks?.find((r) => r.tier === tier);
  if (!rank) return `Tier ${tier}.${badge % 10}`;
  return getRankLabel(rank, badge % 10);
}

/** How a badge range reads in prose: "Phantom 1+", "up to Ritualist 6", "Seeker 1 to Oracle 6" or "all ranks". */
export function rankRangeLabel(ranks: readonly Rank[] | undefined, minBadge: number, maxBadge: number): string {
  const open = maxBadge >= MAX_BADGE;
  if (minBadge <= 0) return open ? "all ranks" : `up to ${badgeLabel(ranks, maxBadge)}`;
  return open ? `${badgeLabel(ranks, minBadge)}+` : `${badgeLabel(ranks, minBadge)} to ${badgeLabel(ranks, maxBadge)}`;
}
