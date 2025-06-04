import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { ASSETS_ORIGIN } from "~/lib/constants";
import type { AssetsRank } from "~/types/assets_rank";
import { ImgWithSkeleton } from "../primitives/ImgWithSkeleton";
import { Skeleton } from "../ui/skeleton";

// Utility function to get rankId from tier and subrank
function getRankId(tier: number, subrank: number): number {
  if (tier === 0) {
    return 0; // Obscurus has no subranks, assign ID 0
  }
  // For tiers 1-11, subranks are 1-6
  // Tier 11 (Eternus) base is 110. Tier 1 base is 10.
  // Adjusted: Eternus (tier 11) starts at 111. Tier 1 starts at 11.
  const baseId = tier * 10;
  // Eternus (tier 11) should map 111-116
  // Ascendant (tier 10) should map 101-106
  // ... Initiate (tier 1) should map 11-16
  return baseId + subrank;
}

// Helper to get the correct image URL
function getRankImageUrl(
  rank: AssetsRank | undefined,
  subrank: number,
  size: "small" | "large" = "small",
  format: "png" | "webp" = "webp",
): string | undefined {
  if (!rank) return undefined;
  if (rank.tier === 0) {
    // Obscurus only has base images
    const key = `${size}_${format}`;
    return rank.images[key as keyof AssetsRank["images"]] ?? rank.images[size as keyof AssetsRank["images"]];
  }
  // Try specific subrank image first (webp, then png)
  let key = `${size}_subrank${subrank}_${format}`;
  if (rank.images[key as keyof AssetsRank["images"]]) {
    return rank.images[key as keyof AssetsRank["images"]];
  }
  key = `${size}_subrank${subrank}`;
  if (rank.images[key as keyof AssetsRank["images"]]) {
    return rank.images[key as keyof AssetsRank["images"]];
  }
  // Fallback to base tier image (webp, then png)
  key = `${size}_${format}`;
  if (rank.images[key as keyof AssetsRank["images"]]) {
    return rank.images[key as keyof AssetsRank["images"]];
  }
  key = `${size}`;
  return rank.images[key as keyof AssetsRank["images"]];
}

export default function RankSelector({
  onRankSelected,
  selectedRank,
  label,
}: { onRankSelected: (selectedRankId: number) => void; selectedRank?: number | null; label?: string }) {
  const { data: ranksData, isLoading } = useQuery<AssetsRank[]>({
    queryKey: ["assets-ranks"],
    queryFn: () => fetch(new URL("/v2/ranks", ASSETS_ORIGIN)).then((res) => res.json()),
    staleTime: Number.POSITIVE_INFINITY,
  });

  // Add type annotation to fix linter error
  const sortedRanks = useMemo(
    () => ranksData?.sort((a: AssetsRank, b: AssetsRank) => a.tier - b.tier) ?? [],
    [ranksData],
  );

  // Prepare options for shadcn Select
  const selectOptions = useMemo(() => {
    type RankOption = { value: number; label: string; rank: AssetsRank; subrank: number };
    const options: RankOption[] = [];
    for (const rank of sortedRanks) {
      const subRanksToShow = rank.tier === 0 ? [1] : [1, 2, 3, 4, 5, 6];
      for (const subrank of subRanksToShow) {
        const rankId = getRankId(rank.tier, subrank);
        options.push({
          value: rankId,
          label: `${rank.name} ${rank.tier === 0 ? "" : subrank}`.trim(),
          rank: rank,
          subrank: subrank,
        });
      }
    }
    return options;
  }, [sortedRanks]);

  const handleValueChange = (value: string) => {
    if (value && value !== "") {
      // Check if value is a non-empty string
      onRankSelected(Number(value));
    }
    // If value is "", do nothing, maintaining the placeholder state
    // This component doesn't seem to support selecting null explicitly
  };

  // Determine the value for the Select component
  // Use empty string "" for null or undefined to show the placeholder
  const selectValue = selectedRank === null || selectedRank === undefined ? "" : String(selectedRank);

  // Find the details for the currently selected rank
  const currentSelectedDetails = selectOptions.find((opt) => opt.value === selectedRank);

  return (
    <div className="flex flex-col gap-1.5 flex-shrink-0">
      <div className="flex justify-center md:justify-start items-center h-8">
        <span className="text-sm font-semibold text-foreground">{label || "Rank"}</span>
      </div>
      {isLoading ? (
        <Skeleton className="h-10 w-32" />
      ) : (
        <Select value={selectValue} onValueChange={handleValueChange}>
          <SelectTrigger className="focus-visible:ring-0">
            <SelectValue placeholder={"Select Rank..."}>
              {currentSelectedDetails ? (
                <div className="flex items-center gap-2 min-w-0">
                  <ImgWithSkeleton
                    src={getRankImageUrl(currentSelectedDetails.rank, currentSelectedDetails.subrank, "small", "webp")}
                    alt={currentSelectedDetails.label}
                    className="size-6 object-contain flex-shrink-0 mb-1"
                  />
                  <span className="truncate">{currentSelectedDetails.label}</span>
                </div>
              ) : null}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {selectOptions.map((optionData) => (
              <SelectItem key={optionData.value} value={String(optionData.value)}>
                <ImgWithSkeleton
                  src={getRankImageUrl(optionData.rank, optionData.subrank, "small", "webp")}
                  alt={optionData.label}
                  className="size-6 object-contain flex-shrink-0 mr-2 mb-1"
                />
                <span className="truncate">{optionData.label}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
