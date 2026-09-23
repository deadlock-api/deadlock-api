import { useRef } from "react";

import { FOCUS_RING } from "~/components/ui/recipes";
import { cn } from "~/lib/utils";

/**
 * A scroll container the reader can drag with the pointer, for a wide diagram that would otherwise need a
 * scrollbar. The wheel, the scrollbar and the keyboard keep working; a drag that moved the content swallows the
 * click that ends it, so dragging across a link does not follow it.
 */
export function DragScroll({
  className,
  children,
  ref: forwardedRef,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerLeave,
  onPointerCancel,
  onClickCapture,
  ...props
}: React.ComponentProps<"div">) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; left: number; moved: boolean; active: boolean } | null>(null);

  return (
    <div
      data-slot="drag-scroll"
      role="presentation"
      // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scroll container must be reachable by keyboard
      tabIndex={0}
      ref={(element) => {
        ref.current = element;
        if (typeof forwardedRef === "function") return forwardedRef(element);
        if (forwardedRef) forwardedRef.current = element;
      }}
      className={cn(FOCUS_RING, "cursor-grab overflow-x-auto active:cursor-grabbing", className)}
      onPointerDown={(event) => {
        onPointerDown?.(event);
        if (event.button !== 0 || !ref.current) return;
        drag.current = { x: event.clientX, left: ref.current.scrollLeft, moved: false, active: true };
      }}
      onPointerMove={(event) => {
        onPointerMove?.(event);
        const state = drag.current;
        if (!state?.active || !ref.current) return;
        // The button came up somewhere this element did not hear about (a native drag of a link or image).
        if ((event.buttons & 1) === 0) {
          drag.current = null;
          return;
        }
        const delta = event.clientX - state.x;
        if (Math.abs(delta) > 3) state.moved = true;
        ref.current.scrollLeft = state.left - delta;
      }}
      onPointerUp={(event) => {
        onPointerUp?.(event);
        // The click comes after pointerup, so `moved` has to outlive it; onClickCapture clears the drag.
        if (drag.current) drag.current.active = false;
      }}
      onPointerLeave={(event) => {
        onPointerLeave?.(event);
        drag.current = null;
      }}
      onPointerCancel={(event) => {
        onPointerCancel?.(event);
        drag.current = null;
      }}
      onClickCapture={(event) => {
        onClickCapture?.(event);
        const moved = drag.current?.moved;
        drag.current = null;
        if (!moved) return;
        event.preventDefault();
        event.stopPropagation();
      }}
      {...props}
    >
      {children}
    </div>
  );
}
