import { ArrowRightIcon, PlusIcon, XIcon } from "lucide-react";
import { useState } from "react";

import { HeroImage } from "~/components/domain/assets/HeroImage";
import { DraftSlotTarget, DraggablePortrait } from "~/components/domain/draft/DraftSlot";
import { Button } from "~/components/ui/button";
import { Stack } from "~/components/ui/stack";
import { useHeroById } from "~/hooks/useAssetById";
import type { Side, Swap } from "~/lib/team-builder/analysis";
import { formatPoints } from "~/lib/team-builder/format";
import { type LaneInfo, TEAM_NAMES } from "~/lib/team-builder/lanes";
import { cn } from "~/lib/utils";

export interface SlotRef {
  side: Side;
  slot: number;
}

export interface DraftSlotProps {
  heroId: number | null;
  slot: number;
  side: Side;
  /** The lane this slot sits in; absent in modes without lanes. */
  lane?: LaneInfo;
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
    <Button
      variant="positive-soft"
      size="xs"
      shape="pill"
      onClick={onApply}
      aria-label={label}
      title={label}
      className="px-1 text-3xs font-semibold"
    >
      {/* The pill fits its slot: a narrow slot (a phone, or both sides side by side) drops the arrow, then the
          number, which the label and title still carry. Wider pills collided with the neighbouring slot's. */}
      <ArrowRightIcon className="hidden size-2.5 @4xs:block" />
      <HeroImage heroId={heroId} shape="circle" className="size-4 shrink-0" />
      <span className="hidden @5xs:inline">{formatPoints(gain)}</span>
    </Button>
  );
}

const MIME = "application/x-deadlock-draft-slot";

/**
 * Names a slot's pick button, which is a different element once the slot is filled. The hero picker finds the slot
 * by it to hand the focus back after a pick, when the button that opened the picker is gone.
 */
export function draftSlotKey({ side, slot }: SlotRef) {
  return `${side}-${slot}`;
}

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
  lane,
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
  // The box takes the slot's width up to the portrait size and keeps itself square, so a row of slots
  // narrower than the portraits shrinks them to fit instead of overlapping each other and the card edge.
  // The portrait fills the box, so it stays round at any width.
  const box = "aspect-square h-auto w-full max-w-11 sm:max-w-13 2xl:max-w-15";

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
      // The same rows as a filled slot (portrait, name, swap hint), so the first pick does not grow the board.
      <Stack gap={1} className="min-w-0 flex-1">
        <DraftSlotTarget
          side={side}
          state={isOver ? "over" : "idle"}
          onClick={onPick}
          data-draft-slot={draftSlotKey({ side, slot })}
          aria-label={`Add hero to ${TEAM_NAMES[side]} ${lane ? `${lane.name} lane` : `slot ${slot + 1}`}`}
          {...dropTargetProps}
          className={cn("mx-auto", box)}
        >
          <PlusIcon className="size-4" />
        </DraftSlotTarget>
        <div aria-hidden="true" className="invisible text-2xs leading-tight">
          &nbsp;
        </div>
        <div className="h-6" />
      </Stack>
    );
  }

  return (
    <Stack gap={1} className="group @container relative min-w-0 flex-1 text-center" {...dropTargetProps}>
      {/* Wrapper sized to the portrait so the clear button anchors to the art, not the wider slot.
          It also keeps the two buttons siblings rather than nested, which is invalid HTML. */}
      <div className={cn("relative mx-auto", box)}>
        <DraggablePortrait
          dragging={isDragging}
          onDragStart={(event) => {
            event.dataTransfer.setData(MIME, `${side}:${slot}`);
            event.dataTransfer.effectAllowed = "move";
            onDragStart();
          }}
          onDragEnd={onDragEnd}
          onClick={onPick}
          data-draft-slot={draftSlotKey({ side, slot })}
          title={`${hero?.name ?? "Hero"}, click to replace or drag to another slot`}
          className="size-full"
        >
          <HeroImage
            heroId={heroId}
            shape="circle"
            ringColor={isOver ? "var(--foreground)" : undefined}
            className="size-full"
          />
        </DraggablePortrait>
        <Button
          variant="secondary"
          size="icon-xs"
          shape="pill"
          onClick={onClear}
          aria-label={`Remove ${hero?.name ?? "hero"}`}
          // Hover-revealed on pointer devices only: there is no hover to reveal it on a phone.
          className="absolute -inset-e-0.5 -top-0.5 text-muted-foreground hover:text-destructive md:hidden md:group-focus-within:flex md:group-hover:flex"
        >
          <XIcon />
        </Button>
      </div>

      <div>
        <div className="truncate text-2xs leading-tight text-foreground" title={hero?.name}>
          {hero?.name ?? "…"}
        </div>
        {player && (
          <div className="truncate text-3xs text-muted-foreground" title={player}>
            {player}
          </div>
        )}
      </div>
      <div className="flex h-6 items-center justify-center">
        {suggestion && (
          <SwapHint heroId={suggestion.in} gain={suggestion.gain} side={side} onApply={() => onSwap(suggestion.in)} />
        )}
      </div>
    </Stack>
  );
}
