import { ArrowLeftRightIcon, ArrowRightIcon } from "lucide-react";

import { Badge } from "~/components/ui/badge";
import { useHeroById } from "~/hooks/useAssetById";
import type { LaneReassignment, Side } from "~/lib/team-builder/analysis";
import { formatPoints } from "~/lib/team-builder/format";
import { laneOfSlot } from "~/lib/team-builder/lanes";
import { cn } from "~/lib/utils";

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

/**
 * The whole row is the apply control, so the moves get the space a separate button would take.
 * `suggestion.gain` belongs to `side`, so the enemy banner is signed and coloured against the reader.
 */
export function LaneSwapBanner({ suggestion, side, onApply }: LaneSwapBannerProps) {
  const ally = side === "ally";
  const label = ally
    ? "Re-lane your picks: same six heroes, better lane split"
    : "Re-lane their picks: same six heroes, better lane split for them";

  return (
    <button
      type="button"
      onClick={onApply}
      title={label}
      className={cn(
        "group mt-2 flex w-full cursor-pointer flex-wrap items-center gap-x-2 gap-y-1 rounded-md border px-2 py-1 text-left",
        ally
          ? "border-green-400/25 bg-green-400/[0.06] hover:border-green-400/50 hover:bg-green-400/10"
          : "border-red-400/25 bg-red-400/[0.06] hover:border-red-400/50 hover:bg-red-400/10",
      )}
    >
      <span className="flex shrink-0 items-center gap-1 text-[11px]">
        <ArrowLeftRightIcon className={cn("size-3", ally ? "text-green-400" : "text-red-400")} />
        <span className={cn("font-semibold", ally ? "text-green-400" : "text-red-400")}>
          {formatPoints(ally ? suggestion.gain : -suggestion.gain)}
        </span>
      </span>
      {suggestion.moves.map((move) => (
        <Move key={move.heroId} {...move} />
      ))}
      <span
        className={cn(
          "ml-auto shrink-0 text-[10px] text-muted-foreground",
          ally ? "group-hover:text-green-400" : "group-hover:text-red-400",
        )}
      >
        Apply
      </span>
    </button>
  );
}
