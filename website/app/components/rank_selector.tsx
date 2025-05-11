import { FormControl, InputLabel, MenuItem, Select } from "@mui/material";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { AssetsRank } from "~/types/assets_rank";

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
    <FormControl fullWidth size="medium" variant="outlined" sx={{ minWidth: 170 }}>
      <InputLabel id="rank-selector-label" sx={{ color: "white" }}>
        {label || "Select Rank"}
      </InputLabel>
      <Select
        labelId="rank-selector-label"
        id="rank-selector"
        value={selectedRank ?? ""}
        label={label || "Select Rank"}
        onChange={(event) => handleSelect(event.target.value)}
        renderValue={(selected) => {
          const currentSelectedDetails = selectOptions.find((opt) => opt.value === selected);
          if (!currentSelectedDetails) {
            return <span className="text-gray-400">Select Rank...</span>;
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
        sx={{
          backgroundColor: "#1e293b",
          color: "white",
          borderRadius: 1,
          "& .MuiOutlinedInput-notchedOutline": {
            borderColor: "#475569",
          },
          "&:hover .MuiOutlinedInput-notchedOutline": {
            borderColor: "#334155",
          },
          "& .MuiSelect-icon": {
            color: "white",
          },
        }}
        MenuProps={{
          slotProps: {
            paper: {
              sx: {
                maxHeight: 400,
                bgcolor: "#0f172a",
                color: "white",
              },
            },
          },
        }}
      >
        {selectOptions.map((optionData) => (
          <MenuItem key={optionData.value} value={optionData.value}>
            <img
              src={getRankImageUrl(optionData.rank, optionData.subrank, "small", "webp")}
              alt={optionData.label}
              className="h-5 w-5 object-contain flex-shrink-0 mr-2"
            />
            <span className="truncate">{optionData.label}</span>
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}
