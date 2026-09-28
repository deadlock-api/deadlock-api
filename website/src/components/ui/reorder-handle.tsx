import { GripVerticalIcon } from "lucide-react";
import { useId } from "react";

import { FOCUS_RING } from "~/components/ui/recipes";
import { cn } from "~/lib/utils";

/**
 * The part of an item you grab to move it: its label with a grip, draggable by pointer and movable with the arrow keys
 * while focused. Spread `useReorder().itemProps(index)` on it; it shows the drag (dimmed) and the drop target (a ring)
 * from the data attributes those props set, and tells assistive technology how to move it.
 */
export function ReorderHandle({
  className,
  children,
  ...props
}: React.ComponentProps<"button"> & {
  /** Names the item and says it moves: "Move Tas". */
  "aria-label": string;
}) {
  const hint = useId();
  return (
    <>
      <button
        type="button"
        data-slot="reorder-handle"
        aria-roledescription="movable"
        aria-describedby={hint}
        className={cn(
          FOCUS_RING,
          "group/handle inline-flex min-h-6 max-w-full min-w-6 cursor-grab touch-none items-center justify-center gap-0.5 rounded-sm select-none active:cursor-grabbing data-dragging:opacity-50 data-over:ring-2 data-over:ring-primary",
          className,
        )}
        {...props}
      >
        <GripVerticalIcon
          aria-hidden="true"
          className="size-3.5 shrink-0 text-muted-foreground group-hover/handle:text-foreground"
        />
        {children}
      </button>
      <span id={hint} className="sr-only">
        Drag, or press the arrow keys, to move.
      </span>
    </>
  );
}
