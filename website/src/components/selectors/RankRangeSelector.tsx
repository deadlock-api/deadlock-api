import { useQuery } from "@tanstack/react-query";
import type { Rank } from "deadlock_api_client";
import { ShieldIcon } from "lucide-react";
import { useMemo } from "react";

import { FilterCell } from "~/components/Filter/FilterCell";
import { Segmented } from "~/components/Segmented";
import { Slider } from "~/components/ui/slider";
import { useDraftValue } from "~/hooks/useDraftValue";
import { getRankImageUrl, getRankLabel } from "~/lib/rank-utils";
import { cn } from "~/lib/utils";
import { ranksQueryOptions } from "~/queries/ranks-query";

import { ImgWithSkeleton } from "../primitives/ImgWithSkeleton";

function getRankId(tier: number, subrank: number): number {
  if (tier === 0) return 0;
  return tier * 10 + subrank;
}

/** Tier bands behind the preset buttons; each spans the first subrank of `from` to the last of `to`. */
const PRESET_BANDS = [
  { label: "Low", from: 1, to: 4 },
  { label: "Mid", from: 5, to: 8 },
  { label: "High", from: 9, to: 10 },
  { label: "Top", from: 11, to: 11 },
] as const;

interface RankOption {
  rankId: number;
  rank: Rank;
  subrank: number;
  label: string;
}

function RankIcon({ option, className }: { option: RankOption; className?: string }) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-white/[0.08] bg-white/[0.1]",
        className,
      )}
    >
      <ImgWithSkeleton
        src={getRankImageUrl(option.rank, "webp", option.subrank) ?? ""}
        alt={option.label}
        // The badge art sits flush to the bottom of a canvas padded with transparency,
        // so scaling from the bottom crops the empty margins without clipping the subrank numeral.
        className="size-full origin-bottom scale-130 object-contain"
      />
    </span>
  );
}

interface RankRangeSelectorProps {
  minRank: number;
  maxRank: number;
  onRankChange: (min: number, max: number) => void;
}

export function RankRangeSelector({ minRank, maxRank, onRankChange }: RankRangeSelectorProps) {
  const { data: ranksData, isLoading } = useQuery(ranksQueryOptions);

  const sortedRanks = useMemo(() => [...(ranksData ?? [])].sort((a: Rank, b: Rank) => a.tier - b.tier), [ranksData]);

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

  const committedValue: [number, number] = [minIndex, maxIndex];
  const [draftValue, setDraftValue] = useDraftValue(committedValue);

  const handleValueCommit = (newValue: number[]) => {
    const [startIdx, endIdx] = newValue;
    if (options[startIdx] && options[endIdx]) {
      onRankChange(options[startIdx].rankId, options[endIdx].rankId);
    }
  };

  const localMinOption = options[draftValue[0]];
  const localMaxOption = options[draftValue[1]];

  const committedMinOption = options[minIndex];
  const committedMaxOption = options[maxIndex];

  const isFullRange = minIndex === 0 && maxIndex === options.length - 1;
  const isMinAtStart = minIndex === 0;
  const isMaxAtEnd = maxIndex === options.length - 1;

  const presets = useMemo(() => {
    if (options.length === 0) return [];
    const first = options[0].rankId;
    const last = options[options.length - 1].rankId;
    const bands = PRESET_BANDS.filter(
      (band) => rankIdToIndex.has(getRankId(band.from, 1)) && rankIdToIndex.has(getRankId(band.to, 6)),
    ).map((band) => ({ label: band.label, min: getRankId(band.from, 1), max: getRankId(band.to, 6) }));
    return [{ label: "Any", min: first, max: last }, ...bands];
  }, [options, rankIdToIndex]);

  const activePreset = presets.find((p) => p.min === minRank && p.max === maxRank)?.label ?? "";

  const getTriggerLabel = () => {
    if (!committedMinOption || !committedMaxOption) return "Select Rank";
    if (isFullRange) return "Any";
    if (isMaxAtEnd) return `${committedMinOption.label}+`;
    if (isMinAtStart) return `Up to ${committedMaxOption.label}`;
    return `${committedMinOption.label} - ${committedMaxOption.label}`;
  };

  if (isLoading || options.length === 0) {
    return null;
  }

  const triggerIcon =
    committedMinOption && !isMinAtStart ? (
      <RankIcon option={committedMinOption} className="size-5" />
    ) : (
      <ShieldIcon className="size-3.5 shrink-0" />
    );

  return (
    <FilterCell label="Rank" value={getTriggerLabel()} active={!isFullRange} icon={triggerIcon} className="w-80 p-4">
      <div className="grid gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {localMinOption && <RankIcon option={localMinOption} className="size-11" />}
            <span className="text-sm font-medium">{localMinOption?.label}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{localMaxOption?.label}</span>
            {localMaxOption && <RankIcon option={localMaxOption} className="size-11" />}
          </div>
        </div>
        <div className="pt-2 pb-2">
          <Slider
            value={draftValue}
            min={0}
            max={options.length - 1}
            step={1}
            minStepsBetweenThumbs={0}
            onValueChange={(newValue) => setDraftValue([newValue[0] ?? minIndex, newValue[1] ?? maxIndex])}
            onValueCommit={handleValueCommit}
            className="[&_[role=slider]]:h-4 [&_[role=slider]]:w-4"
          />
        </div>
        <Segmented
          value={activePreset}
          onValueChange={(name) => {
            const preset = presets.find((p) => p.label === name);
            if (preset) onRankChange(preset.min, preset.max);
          }}
          options={presets.map((p) => ({ value: p.label, label: p.label }))}
        />
      </div>
    </FilterCell>
  );
}
