import { useLayoutEffect, useRef, useState } from "react";

import { assignRef } from "~/components/ui/hooks/assign-ref";
import { FOCUS_RING, SCROLLBAR_THIN } from "~/components/ui/recipes";
import { cn } from "~/lib/utils";

const AXIS = {
  y: "overflow-y-auto scroll-fade-y",
  x: "overflow-x-auto scroll-fade-x",
} as const;

/**
 * A box that scrolls its content on one axis (`y` by default), with the thin token scrollbar and a fade on the edge
 * with more content past it. While its content overflows it is a named region in the tab order, so a keyboard reader
 * can focus it and scroll with the arrow keys; content that fits leaves no empty tab stop. The size limit
 * (`max-h-96`) comes from the caller. `label` names the region ("Patch notes").
 */
export function ScrollArea({
  axis = "y",
  label,
  className,
  ref,
  ...props
}: Omit<React.ComponentProps<"div">, "aria-label"> & { axis?: keyof typeof AXIS; label: string }) {
  const element = useRef<HTMLDivElement | null>(null);
  const [overflowing, setOverflowing] = useState(false);
  // Measured before paint and whenever the box or its content resizes.
  useLayoutEffect(() => {
    const box = element.current;
    if (!box) return;
    const update = () =>
      setOverflowing(axis === "y" ? box.scrollHeight > box.clientHeight + 1 : box.scrollWidth > box.clientWidth + 1);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(box);
    for (const child of box.children) observer.observe(child);
    return () => observer.disconnect();
  }, [axis]);
  return (
    <div
      data-slot="scroll-area"
      data-axis={axis}
      data-state={overflowing ? "overflowing" : "fits"}
      role={overflowing ? "region" : undefined}
      aria-label={overflowing ? label : undefined}
      // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrolling region must be reachable by keyboard
      tabIndex={overflowing ? 0 : undefined}
      ref={(node) => {
        element.current = node;
        return assignRef(ref, node);
      }}
      className={cn(FOCUS_RING, SCROLLBAR_THIN, "min-h-0 rounded-sm", AXIS[axis], className)}
      {...props}
    />
  );
}
