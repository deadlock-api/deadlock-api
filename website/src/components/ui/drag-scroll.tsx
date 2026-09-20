import { useRef } from "react";

import { cn } from "~/lib/utils";

/**
 * A scroll container the reader can drag with the pointer, for a wide diagram that would otherwise need a
 * scrollbar. The wheel, the scrollbar and the keyboard keep working; a drag that moved the content swallows the
 * click that ends it, so dragging across a link does not follow it.
 */
export function DragScroll({ className, children, ...props }: React.ComponentProps<"div">) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null);

  return (
    <div
      data-slot="drag-scroll"
      role="presentation"
      // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scroll container must be reachable by keyboard
      tabIndex={0}
      ref={ref}
      className={cn(
        "cursor-grab overflow-x-auto outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:cursor-grabbing",
        className,
      )}
      onPointerDown={(event) => {
        if (event.button !== 0 || !ref.current) return;
        drag.current = { x: event.clientX, left: ref.current.scrollLeft, moved: false };
      }}
      onPointerMove={(event) => {
        const state = drag.current;
        if (!state || !ref.current) return;
        const delta = event.clientX - state.x;
        if (Math.abs(delta) > 3) state.moved = true;
        ref.current.scrollLeft = state.left - delta;
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
      onPointerLeave={() => {
        drag.current = null;
      }}
      onClickCapture={(event) => {
        if (!drag.current?.moved) return;
        event.preventDefault();
        event.stopPropagation();
      }}
      {...props}
    >
      {children}
    </div>
  );
}
