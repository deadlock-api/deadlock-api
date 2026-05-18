import type { RankV2 } from "assets_deadlock_api_client";

export function getRankImageUrl(
  rank: RankV2 | undefined,
  subrank: number,
  size: "small" | "large" = "small",
  format: "png" | "webp" = "webp",
): string | undefined | null {
  if (!rank) return null;
  if (rank.tier === 0) {
    // Obscurus only has base images
    const key = `${size}_${format}`;
    return rank.images[key as keyof RankV2["images"]] ?? rank.images[size as keyof RankV2["images"]];
  }
  // Try specific subrank image first (webp, then png)
  let key = `${size}_subrank${subrank}_${format}`;
  if (rank.images[key as keyof RankV2["images"]]) {
    return rank.images[key as keyof RankV2["images"]];
  }
  key = `${size}_subrank${subrank}`;
  if (rank.images[key as keyof RankV2["images"]]) {
    return rank.images[key as keyof RankV2["images"]];
  }
  // Fallback to base tier image (webp, then png)
  key = `${size}_${format}`;
  if (rank.images[key as keyof RankV2["images"]]) {
    return rank.images[key as keyof RankV2["images"]];
  }
  key = `${size}`;
  return rank.images[key as keyof RankV2["images"]];
}

export function getRankLabel(rank: RankV2, subrank: number): string {
  return rank.tier === 0 ? rank.name : `${rank.name} ${subrank}`;
}
