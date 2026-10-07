import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "~/lib/utils";

const dropZoneVariants = cva(
  "flex min-w-0 flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-4 text-center transition-colors duration-fast ease-standard motion-reduce:transition-none",
  {
    variants: {
      /** `over`: something is dragged over the zone and would be dropped into it. */
      state: {
        idle: "border-border bg-muted/30",
        over: "border-primary bg-primary/5",
      },
      /** A fixed height, so the zone keeps its size whatever its content says (idle, busy, a result). */
      size: {
        default: "h-56",
        sm: "h-36",
      },
    },
    defaultVariants: { state: "idle", size: "default" },
  },
);

/**
 * A target to drop files or a folder onto. Presentation only: `useDropZone` holds the drag behavior and its
 * `dropZoneProps` go on this element. Children are the content of each state; a drop zone always also holds a
 * `Button` that opens the file picker, because dragging is not available to keyboard and touch users.
 */
export function DropZone({
  state,
  size,
  className,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof dropZoneVariants>) {
  return (
    <div
      data-slot="drop-zone"
      data-state={state ?? "idle"}
      className={cn(dropZoneVariants({ state, size }), className)}
      {...props}
    />
  );
}
