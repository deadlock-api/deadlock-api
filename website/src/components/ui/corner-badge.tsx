import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "~/lib/utils";

const cornerBadgeVariants = cva(
  "pointer-events-none absolute rounded-sm px-0.5 text-4xs leading-tight font-semibold whitespace-nowrap tabular-nums",
  {
    variants: {
      corner: {
        "top-end": "-end-1.5 -top-1.5",
        "bottom-end": "-end-1.5 -bottom-1",
        "top-start": "-start-1.5 -top-1.5",
        "bottom-start": "-start-1.5 -bottom-1",
      },
      tone: {
        surface: "bg-background text-foreground",
        muted: "bg-background text-muted-foreground",
        /** On artwork, where no surface color is guaranteed behind the badge. */
        scrim: "bg-background/85 text-foreground",
      },
    },
    defaultVariants: { corner: "top-end", tone: "surface" },
  },
);

/** A count pinned to the corner of an icon or portrait: stacks, levels, purchase order. The parent is `relative`. */
export function CornerBadge({
  corner,
  tone,
  className,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof cornerBadgeVariants>) {
  return <span data-slot="corner-badge" className={cn(cornerBadgeVariants({ corner, tone }), className)} {...props} />;
}
