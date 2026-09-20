import { ArrowLeftRightIcon, ArrowRightIcon } from "lucide-react";

import { HeroImage } from "~/components/domain/assets/HeroImage";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { useHeroById } from "~/hooks/useAssetById";
import type { LaneReassignment, Side } from "~/lib/team-builder/analysis";
import { formatPoints } from "~/lib/team-builder/format";
import { laneOfSlot } from "~/lib/team-builder/lanes";
import { TONE_TEXT } from "~/lib/tone";
import { cn } from "~/lib/utils";

function LaneName({ slot }: { slot: number }) {
  const lane = laneOfSlot(slot);
  return <span className={cn("font-semibold", lane.textClass)}>{lane.name}</span>;
}

function Move({ heroId, fromSlot, toSlot }: { heroId: number; fromSlot: number; toSlot: number }) {
  const { hero } = useHeroById(heroId);
  return (
    <Badge variant="muted" size="sm" className="ps-px pe-1.5" title={hero?.name}>
      <HeroImage heroId={heroId} shape="circle" className="size-4 shrink-0" />
      <LaneName slot={fromSlot} />
      <ArrowRightIcon className="size-2.5 text-muted-foreground" />
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
  const tone = ally ? "positive" : "negative";
  const label = ally
    ? "Re-lane your picks: same six heroes, better lane split"
    : "Re-lane their picks: same six heroes, better lane split for them";

  return (
    <Button
      variant={`${tone}-soft`}
      onClick={onApply}
      title={label}
      className="group h-auto w-full flex-wrap justify-start gap-x-2 gap-y-1 px-2 py-1 text-start font-normal whitespace-normal text-foreground"
    >
      <span className={cn("flex shrink-0 items-center gap-1 text-2xs font-semibold", TONE_TEXT[tone])}>
        <ArrowLeftRightIcon className="size-3" />
        {formatPoints(ally ? suggestion.gain : -suggestion.gain)}
      </span>
      {suggestion.moves.map((move) => (
        <Move key={move.heroId} {...move} />
      ))}
      <span
        className={cn(
          "ms-auto shrink-0 text-3xs text-muted-foreground",
          ally ? "group-hover:text-positive" : "group-hover:text-negative",
        )}
      >
        Apply
      </span>
    </Button>
  );
}
