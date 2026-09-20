import { FOCUS_RING } from "~/components/ui/recipes";
import { cn } from "~/lib/utils";

type DraftSide = "ally" | "enemy";

const SIDE_BORDER: Record<DraftSide, string> = {
  ally: "border-positive/30",
  enemy: "border-primary/30",
};

interface DraftSlotTargetProps extends React.ComponentProps<"button"> {
  /** Which team's row the slot belongs to; it tints the empty outline. */
  side?: DraftSide;
  /** `idle` is the waiting outline, `over` the one a hero is being dragged onto (solid, not only brighter). */
  state?: "idle" | "over";
}

/** The round drop target of a draft board: an empty slot, or the ring a filled one shows while a hero hovers it. */
export function DraftSlotTarget({
  side = "ally",
  state = "idle",
  className,
  children,
  ...props
}: DraftSlotTargetProps) {
  return (
    // ds-allow raw-button: a draft slot is a bespoke round hit area sized to the portraits beside it
    <button
      type="button"
      data-slot="draft-slot-target"
      data-side={side}
      data-state={state}
      className={cn(
        "flex size-11 items-center justify-center rounded-full border border-dashed text-muted-foreground",
        FOCUS_RING,
        "transition-colors duration-fast hover:bg-subtle-hover",
        state === "over" ? "border-solid border-foreground/40 bg-subtle-active" : SIDE_BORDER[side],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

interface DraggablePortraitProps extends React.ComponentProps<"button"> {
  /** This portrait is the one being dragged; it fades so the drop targets read first. */
  dragging?: boolean;
}

/** The hero portrait of a filled draft slot: a button that can be picked up and dropped into another slot. */
export function DraggablePortrait({ dragging = false, className, children, ...props }: DraggablePortraitProps) {
  return (
    // ds-allow raw-button: the draggable hero portrait of a draft slot, a hit area shaped by its art
    <button
      type="button"
      draggable
      data-slot="draggable-portrait"
      data-dragging={dragging || undefined}
      className={cn(
        FOCUS_RING,
        "block cursor-grab rounded-full active:cursor-grabbing",
        dragging && "opacity-40",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
