import { useQuery } from "@tanstack/react-query";
import type { RankV2 } from "assets_deadlock_api_client";
import { ShieldIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { FilterPill } from "~/components/FilterPill";
import { Slider } from "~/components/ui/slider";
import { CACHE_DURATIONS } from "~/constants/cache";
import { assetsApi } from "~/lib/assets-api";
import { getRankImageUrl, getRankLabel } from "~/lib/rank-utils";
import { queryKeys } from "~/queries/query-keys";
import { ImgWithSkeleton } from "../primitives/ImgWithSkeleton";

function getRankId(tier: number, subrank: number): number {
  if (tier === 0) return 0;
  return tier * 10 + subrank;
}

interface RankOption {
  rankId: number;
  rank: RankV2;
  subrank: number;
  label: string;
}

interface RankRangeSelectorProps {
  minRank: number;
  maxRank: number;
  onRankChange: (min: number, max: number) => void;
  label?: string;
}

export function RankRangeSelector({ minRank, maxRank, onRankChange, label }: RankRangeSelectorProps) {
  const { data: ranksData, isLoading } = useQuery({
    queryKey: queryKeys.assets.ranks(),
    queryFn: async () => {
      const response = await assetsApi.default_api.getRanksV2RanksGet();
      return response.data;
    },
    staleTime: CACHE_DURATIONS.FOREVER,
  });

  const sortedRanks = useMemo(() => ranksData?.sort((a: RankV2, b: RankV2) => a.tier - b.tier) ?? [], [ranksData]);

  const options: RankOption[] = useMemo(() => {
    const opts: RankOption[] = [];
    for (const rank of sortedRanks) {
      const subRanksToShow = rank.tier === 0 ? [1] : [1, 2, 3, 4, 5, 6];
      for (const subrank of subRanksToShow) {
        opts.push({
          rankId: getRankId(rank.tier, subrank),
          rank,
          subrank,
          label: getRankLabel(rank, subrank),
        });
      }
    }
    return opts;
  }, [sortedRanks]);

  const rankIdToIndex = useMemo(() => {
    const map = new Map<number, number>();
    for (let i = 0; i < options.length; i++) {
      map.set(options[i].rankId, i);
    }
    return map;
  }, [options]);

  const minIndex = rankIdToIndex.get(minRank) ?? 0;
  const maxIndex = rankIdToIndex.get(maxRank) ?? options.length - 1;

  const [localValue, setLocalValue] = useState([minIndex, maxIndex]);

  useEffect(() => {
    setLocalValue([minIndex, maxIndex]);
  }, [minIndex, maxIndex]);

  const handleValueCommit = (newValue: number[]) => {
    const [startIdx, endIdx] = newValue;
    if (options[startIdx] && options[endIdx]) {
      onRankChange(options[startIdx].rankId, options[endIdx].rankId);
    }
  };

  const localMinOption = options[localValue[0]];
  const localMaxOption = options[localValue[1]];

  const committedMinOption = options[minIndex];
  const committedMaxOption = options[maxIndex];

  const isFullRange = minIndex === 0 && maxIndex === options.length - 1;
  const isMinAtStart = minIndex === 0;
  const isMaxAtEnd = maxIndex === options.length - 1;

  const getTriggerLabel = () => {
    if (!committedMinOption || !committedMaxOption) return "Select Rank";
    if (isFullRange) return "All Ranks";
    if (isMaxAtEnd) return `${committedMinOption.label}+`;
    if (isMinAtStart) return `Up to ${committedMaxOption.label}`;
    return `${committedMinOption.label} - ${committedMaxOption.label}`;
  };

  if (isLoading || options.length === 0) {
    return null;
  }

  const triggerIcon =
    committedMinOption && !isMinAtStart ? (
      <ImgWithSkeleton
        src={getRankImageUrl(committedMinOption.rank, committedMinOption.subrank, "small", "webp") ?? ""}
        alt={committedMinOption.label}
        className="size-4 object-contain shrink-0"
      />
    ) : (
      <ShieldIcon className="size-3.5 shrink-0" />
    );

  return (
    <FilterPill
      label={label ?? "Rank"}
      value={getTriggerLabel()}
      active={!isFullRange}
      icon={triggerIcon}
      className="w-80 p-4"
    >
      <div className="grid gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {localMinOption && (
              <ImgWithSkeleton
                src={getRankImageUrl(localMinOption.rank, localMinOption.subrank, "small", "webp") ?? ""}
                alt={localMinOption.label}
                className="size-6 object-contain shrink-0"
              />
            )}
            <span className="text-sm font-medium">{localMinOption?.label}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{localMaxOption?.label}</span>
            {localMaxOption && (
              <ImgWithSkeleton
                src={getRankImageUrl(localMaxOption.rank, localMaxOption.subrank, "small", "webp") ?? ""}
                alt={localMaxOption.label}
                className="size-6 object-contain shrink-0"
              />
            )}
          </div>
        </div>
        <div className="pt-2 pb-2">
          <Slider
            value={localValue}
            min={0}
            max={options.length - 1}
            step={1}
            minStepsBetweenThumbs={0}
            onValueChange={setLocalValue}
            onValueCommit={handleValueCommit}
            className="[&_[role=slider]]:h-4 [&_[role=slider]]:w-4"
          />
        </div>
      </div>
    </FilterPill>
  );
}
