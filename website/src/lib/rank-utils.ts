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
