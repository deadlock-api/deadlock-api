import { useQuery } from "@tanstack/react-query";
import type { RankV2 } from "assets-deadlock-api-client";
import { useMemo } from "react";
import { Skeleton } from "~/components/ui/skeleton";
import { assetsApi } from "~/lib/assets-api";
import { cn } from "~/lib/utils";

// Utility function to get tier and subrank from rankId
function getTierAndSubrank(rankId: number): { tier: number; subrank: number } {
  if (rankId === 0) {
    return { tier: 0, subrank: 1 }; // Obscurus
  }

  const tier = Math.floor(rankId / 10);
  const subrank = rankId % 10;

  return { tier, subrank };
}

// Helper to get the correct image URL
function getRankImageUrl(
  rank: RankV2 | undefined,
  subrank: number,
  size: "small" | "large" = "small",
  format: "png" | "webp" = "webp",
): string | undefined | null {
  if (!rank) return undefined;
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

export default function RankImage({
  rankId,
  className,
  size = "small",
}: {
  rankId: number;
  className?: string;
  size?: "small" | "large";
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["assets-ranks"],
    queryFn: async () => {
      const response = await assetsApi.default_api.getRanksV2RanksGet();
      return response.data;
    },
    staleTime: Number.POSITIVE_INFINITY,
  });

  const { tier, subrank } = useMemo(() => getTierAndSubrank(rankId), [rankId]);

  const rank = useMemo(() => data?.find((rank) => rank.tier === tier), [data, tier]);

  const webpImageUrl = useMemo(() => getRankImageUrl(rank, subrank, size, "webp"), [rank, subrank, size]);
  const pngImageUrl = useMemo(() => getRankImageUrl(rank, subrank, size, "png"), [rank, subrank, size]);

  if (isLoading) {
    return <Skeleton className={cn("size-8", className)} />;
  }

  if (!rank) {
    return <div>ENORANK</div>;
  }

  if (!webpImageUrl && !pngImageUrl) {
    return <div>ENOIMG</div>;
  }

  const rankLabel = `${rank.name} ${rank.tier === 0 ? "" : subrank}`.trim();

  return (
    <picture>
      {webpImageUrl && <source srcSet={webpImageUrl} type="image/webp" />}
      {pngImageUrl && <source srcSet={pngImageUrl} type="image/png" />}
      <img
        loading="lazy"
        src={pngImageUrl || webpImageUrl || ""} // Fallback for browsers that don't support <picture>
        alt={rankLabel}
        title={rankLabel}
        className={cn("h-8", className)}
      />
    </picture>
  );
}
