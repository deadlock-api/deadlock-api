import { Select } from "@base-ui-components/react/select";
import { useSuspenseQuery } from "@tanstack/react-query";
import type React from "react";
import { useMemo } from "react";
import type { AssetsRank } from "~/types/assets_rank";
import { twc } from "react-twc";

// Utility function to get rankId from tier and subrank
function getRankId(tier: number, subrank: number): number {
  if (tier === 0) {
    return 0; // Obscurus has no subranks, assign ID 0
  }
  // For tiers 1-11, subranks are 1-6
  // Tier 11 (Eternus) base is 110. Tier 1 base is 10.
  // Adjusted: Eternus (tier 11) starts at 110. Tier 1 starts at 10.
  const baseId = tier * 10;
  // Eternus (tier 11) should map 110-115
  // Ascendant (tier 10) should map 100-105
  // ... Initiate (tier 1) should map 10-15
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

const StyledPopup = twc(Select.Popup)`
  group
  [max-height:var(--available-height)]
  origin-[var(--transform-origin)]
  overflow-y-auto
  rounded-md
  bg-slate-900
  py-1
  text-slate-300
  shadow-none
  outline-1
  outline-white/10
  transition-[transform,scale,opacity]
  data-[ending-style]:scale-100
  data-[ending-style]:opacity-100
  data-[ending-style]:transition-none
  data-[starting-style]:scale-90
  data-[starting-style]:opacity-0
  data-[side=none]:data-[starting-style]:scale-100
  data-[side=none]:data-[starting-style]:opacity-100
  data-[side=none]:data-[starting-style]:transition-none
`;

const StyledItem = twc(Select.Item)`
  grid min-w-[var(--anchor-width)] cursor-default grid-cols-[1.5rem_1fr] items-center gap-2 py-2 pr-4 pl-2.5 text-sm leading-4 outline-none select-none
  group-data-[side=none]:min-w-[calc(var(--anchor-width)+1rem)]
  group-data-[side=none]:pr-12
  group-data-[side=none]:text-base
  group-data-[side=none]:leading-4
  data-[highlighted]:relative
  data-[highlighted]:z-0
  data-[highlighted]:text-gray-900
  data-[highlighted]:before:absolute
  data-[highlighted]:before:inset-x-1
  data-[highlighted]:before:inset-y-0
  data-[highlighted]:before:z-[-1]
  data-[highlighted]:before:rounded-sm
  data-[highlighted]:before:bg-gray-300
`;

export default function RankSelector({
  onRankSelected,
  selectedRank,
  label,
}: { onRankSelected: (selectedRankId: number) => void; selectedRank?: number | null; label?: string }) {
  const { data: ranksData } = useSuspenseQuery<AssetsRank[]>({
    queryKey: ["assets-ranks"],
    queryFn: () => fetch("https://assets.deadlock-api.com/v2/ranks").then((res) => res.json()),
    staleTime: Number.POSITIVE_INFINITY,
  });

  const sortedRanks = useMemo(() => ranksData?.sort((a, b) => a.tier - b.tier) ?? [], [ranksData]);

  const handleSelect = (value: number | null) => {
    if (value !== null) {
      onRankSelected(value);
    }
  };

  // Prepare options for Base UI Select
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

  return (
    <div className="w-full max-w-xs">
      <span className="block mb-2 text-sm font-medium text-white">{label || "Select Rank"}</span>
      <Select.Root<number>
        value={selectedRank ?? undefined} // Use undefined for uncontrolled without value?
        onValueChange={handleSelect}
      >
        <Select.Trigger className="flex h-10 min-w-42 items-center justify-between gap-3 rounded-md border border-gray-600 pr-3 pl-3.5 text-base text-gray-100 select-none hover:bg-gray-700 focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-blue-800 active:bg-gray-700 data-[popup-open]:bg-gray-700">
          <Select.Value placeholder="Select Rank...">
            {(_, value) => {
              const currentSelectedDetails = selectOptions.find((opt) => opt.value === value);
              const placeholder = "Select Rank...";
              if (!currentSelectedDetails) {
                return placeholder;
              }
              return (
                <div className="flex items-center gap-2">
                  <img
                    src={getRankImageUrl(currentSelectedDetails.rank, currentSelectedDetails.subrank, "small", "webp")}
                    alt={currentSelectedDetails.label}
                    className="h-5 w-5 object-contain flex-shrink-0"
                  />
                  <span className="truncate">{currentSelectedDetails.label}</span>
                </div>
              );
            }}
          </Select.Value>
          <Select.Icon className="flex">
            <span className="icon-[material-symbols--unfold-more-rounded] text-lg" />
          </Select.Icon>
        </Select.Trigger>

        <Select.Portal>
          <Select.Positioner className="z-50 outline-none" sideOffset={8}>
            <StyledPopup>
              {selectOptions.map((optionData) => (
                <StyledItem key={optionData.value} value={optionData.value}>
                  <Select.ItemIndicator className="col-start-1 flex justify-center">
                    <span className="icon-[material-symbols--check-rounded] size-3" />
                  </Select.ItemIndicator>
                  <Select.ItemText className="col-start-2 flex items-center gap-2">
                    <img
                      src={getRankImageUrl(optionData.rank, optionData.subrank, "small", "webp")}
                      alt={optionData.label}
                      className="h-5 w-5 object-contain flex-shrink-0"
                    />
                    <span className="truncate">{optionData.label}</span>
                  </Select.ItemText>
                </StyledItem>
              ))}
            </StyledPopup>
          </Select.Positioner>
        </Select.Portal>
      </Select.Root>
    </div>
  );
}
