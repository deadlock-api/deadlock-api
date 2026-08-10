import { ArrowLeftRightIcon, ArrowRightIcon } from "lucide-react";

import { Badge } from "~/components/ui/badge";
import { useHeroById } from "~/hooks/useAssetById";
import type { LaneReassignment, Side } from "~/lib/team-builder/analysis";
import { formatPoints } from "~/lib/team-builder/format";
import { laneOfSlot } from "~/lib/team-builder/lanes";

import { HeroPortrait } from "./HeroPortrait";

function LaneName({ slot }: { slot: number }) {
  const lane = laneOfSlot(slot);
  return (
    <span className="font-semibold" style={{ color: lane.color }}>
      {lane.name}
    </span>
  );
}

function Move({ heroId, fromSlot, toSlot }: { heroId: number; fromSlot: number; toSlot: number }) {
  const { hero } = useHeroById(heroId);
  return (
    <Badge variant="ghost" className="bg-white/[0.05] py-px pr-1.5 pl-px text-[10px]" title={hero?.name}>
      <HeroPortrait heroId={heroId} size="size-4" />
      <LaneName slot={fromSlot} />
      <ArrowRightIcon className="size-2.5 opacity-50" />
      <LaneName slot={toSlot} />
    </Badge>
  );
}

interface LaneSwapBannerProps {
  suggestion: LaneReassignment;
  side: Side;
  onApply: () => void;
}

/** The whole row is the apply control, so the moves get the space a separate button would take. */
export function LaneSwapBanner({ suggestion, side, onApply }: LaneSwapBannerProps) {
  return (
    <button
      type="button"
      onClick={onApply}
      title={`Re-lane ${side === "ally" ? "your" : "their"} picks: same six heroes, better lane split`}
      className="group mt-2 flex w-full cursor-pointer flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-green-400/25 bg-green-400/[0.06] px-2 py-1 text-left hover:border-green-400/50 hover:bg-green-400/10"
    >
      <span className="flex shrink-0 items-center gap-1 text-[11px]">
        <ArrowLeftRightIcon className="size-3 text-green-400" />
        <span className="font-semibold text-green-400">{formatPoints(suggestion.gain)}</span>
      </span>
      {suggestion.moves.map((move) => (
        <Move key={move.heroId} {...move} />
      ))}
      <span className="ml-auto shrink-0 text-[10px] text-muted-foreground group-hover:text-green-400">Apply</span>
    </button>
  );
}
