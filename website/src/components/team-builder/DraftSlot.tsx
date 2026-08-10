import { ArrowRightIcon, PlusIcon, XIcon } from "lucide-react";
import { useState } from "react";

import { Badge } from "~/components/ui/badge";
import { useHeroById } from "~/hooks/useAssetById";
import type { Side, Swap } from "~/lib/team-builder/analysis";
import { formatPoints } from "~/lib/team-builder/format";
import { laneOfSlot, TEAM_NAMES } from "~/lib/team-builder/lanes";
import { cn } from "~/lib/utils";

import { HeroPortrait } from "./HeroPortrait";

export interface SlotRef {
  side: Side;
  slot: number;
}

export interface DraftSlotProps {
  heroId: number | null;
  slot: number;
  side: Side;
  /** Steam persona of the player who picked this hero, when the draft came from a real match. */
  player?: string;
  /** Best single replacement for this slot, offered inline instead of in a separate panel. */
  suggestion?: Swap;
  isDragging?: boolean;
  onPick: () => void;
  onClear: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDropHero: (from: SlotRef) => void;
  onSwap: (heroId: number) => void;
}

/**
 * `gain` already reads from the side that owns the slot — `searchSwaps` flips the sign for the enemy
 * — so it is positive on both sides and printed as it arrives. Negating it again for the enemy made
 * an upgrade for them read as a loss.
 */
function SwapHint({ heroId, gain, side, onApply }: { heroId: number; gain: number; side: Side; onApply: () => void }) {
  const { hero } = useHeroById(heroId);
  const ally = side === "ally";
  const label = ally
    ? `Swap to ${hero?.name ?? "this hero"} for ${formatPoints(gain)} predicted win rate`
    : `Their best upgrade here: ${hero?.name ?? "this hero"}, worth ${formatPoints(gain)} to their predicted win rate`;

  return (
    <Badge
      asChild
      variant="outline"
      className="cursor-pointer border-green-400/25 bg-green-400/10 px-1 py-px text-[10px] font-semibold text-green-400 hover:border-green-400/50 hover:bg-green-400/20"
    >
      <button type="button" onClick={onApply} aria-label={label} title={label}>
        <ArrowRightIcon className="size-2.5" />
        <HeroPortrait heroId={heroId} size="size-4" />
        {formatPoints(gain)}
      </button>
    </Badge>
  );
}

const EMPTY_RING = {
  ally: "border-green-400/30",
  enemy: "border-primary/30",
} as const;

const MIME = "application/x-deadlock-draft-slot";

function readSlotRef(event: React.DragEvent): SlotRef | null {
  const [side, slot] = event.dataTransfer.getData(MIME).split(":");
  if (side !== "ally" && side !== "enemy") return null;
  const index = Number.parseInt(slot, 10);
  return Number.isFinite(index) ? { side, slot: index } : null;
}

export function DraftSlot({
  heroId,
  slot,
  side,
  player,
  suggestion,
  isDragging,
  onPick,
  onClear,
  onDragStart,
  onDragEnd,
  onDropHero,
  onSwap,
}: DraftSlotProps) {
  const { hero } = useHeroById(heroId ?? -1);
  const [isOver, setIsOver] = useState(false);
  // The portrait is an <img> with an explicit height, so a slot narrower than the art leaves
  // preflight's `max-width: 100%` clamping width alone and the hero renders as an oval. The 44px
  // floor is also the touch-target minimum.
  const box = "size-11 sm:size-13 2xl:size-15";

  // Both filled and empty slots take a drop: dropping on an empty one moves a hero to another lane,
  // dropping on a filled one swaps the two.
  const dropTargetProps = {
    onDragOver: (event: React.DragEvent) => {
      if (!event.dataTransfer.types.includes(MIME)) return;
      event.preventDefault();
      setIsOver(true);
    },
    onDragLeave: () => setIsOver(false),
    onDrop: (event: React.DragEvent) => {
      event.preventDefault();
      setIsOver(false);
      const from = readSlotRef(event);
      if (from) onDropHero(from);
    },
  };

  if (heroId === null) {
    return (
      <button
        type="button"
        onClick={onPick}
        aria-label={`Add hero to ${TEAM_NAMES[side]} ${laneOfSlot(slot).name} lane`}
        {...dropTargetProps}
        className={cn(
          "mx-auto flex cursor-pointer items-center justify-center rounded-full border border-dashed",
          box,
          "text-muted-foreground/40 transition-colors hover:bg-white/[0.04] hover:text-muted-foreground",
          isOver ? "border-solid border-white/40 bg-white/10" : EMPTY_RING[side],
        )}
      >
        <PlusIcon className="size-4" />
      </button>
    );
  }

  return (
    <div className={cn("group relative min-w-0 flex-1 text-center", isDragging && "opacity-40")} {...dropTargetProps}>
      {/* Wrapper sized to the portrait so the clear button anchors to the art, not the wider slot.
          It also keeps the two buttons siblings rather than nested, which is invalid HTML. */}
      <div className="relative mx-auto w-fit">
        <button
          type="button"
          draggable
          onDragStart={(event) => {
            event.dataTransfer.setData(MIME, `${side}:${slot}`);
            event.dataTransfer.effectAllowed = "move";
            onDragStart();
          }}
          onDragEnd={onDragEnd}
          onClick={onPick}
          title={`${hero?.name ?? "Hero"}, click to replace or drag to another slot`}
          className="block cursor-grab active:cursor-grabbing"
        >
          <HeroPortrait heroId={heroId} size={box} className={cn(isOver && "ring-2 ring-white/60")} />
        </button>
        <button
          type="button"
          onClick={onClear}
          aria-label={`Remove ${hero?.name ?? "hero"}`}
          // Hover-revealed on pointer devices only: there is no hover to reveal it on a phone.
          className={cn(
            "absolute -top-0.5 -right-0.5 flex size-6 cursor-pointer items-center justify-center rounded-full sm:size-5",
            "border border-border bg-background text-muted-foreground shadow-sm",
            "hover:border-destructive/60 hover:text-destructive md:hidden md:group-hover:flex",
          )}
        >
          <XIcon className="size-3" />
        </button>
      </div>

      <div className="mt-1 truncate text-[11px] leading-tight text-foreground" title={hero?.name}>
        {hero?.name ?? "…"}
      </div>
      {player && (
        <div className="truncate text-[10px] text-muted-foreground" title={player}>
          {player}
        </div>
      )}
      <div className="mt-1 flex h-5 items-center justify-center">
        {suggestion && (
          <SwapHint heroId={suggestion.in} gain={suggestion.gain} side={side} onApply={() => onSwap(suggestion.in)} />
        )}
      </div>
    </div>
  );
}
