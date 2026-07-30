import type { Rank } from "deadlock_api_client";

export function getRankImageUrl(rank: Rank | undefined, format: "png" | "webp" = "webp"): string | undefined | null {
  if (!rank) return null;
  return format === "webp" ? (rank.images.large_webp ?? rank.images.large) : rank.images.large;
}

export function getRankLabel(rank: Rank, subrank: number): string {
  return rank.tier === 0 ? rank.name : `${rank.name} ${subrank}`;
}
