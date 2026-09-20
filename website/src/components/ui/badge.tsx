import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { FOCUS_RING_BORDER, INVALID_STATE } from "~/components/ui/recipes";
import { TONE_SOFT } from "~/lib/tone";
import { cn } from "~/lib/utils";

const badgeVariants = cva(
  [
    FOCUS_RING_BORDER,
    INVALID_STATE,
    "inline-flex w-fit max-w-full shrink-0 items-center justify-center gap-1 overflow-hidden border border-transparent font-medium whitespace-nowrap transition-[color,box-shadow] [&>span]:min-w-0 [&>span]:truncate [&>svg]:pointer-events-none [&>svg]:size-3 [&>svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
        secondary: "bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",
        destructive:
          "bg-destructive text-destructive-foreground focus-visible:ring-destructive/40 [a&]:hover:bg-destructive/90",
        outline: "border-border text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        muted: "bg-muted text-muted-foreground",
        soft: "border-primary/30 bg-primary/10 text-primary",
        positive: TONE_SOFT.positive,
        negative: TONE_SOFT.negative,
        warning: "border-warning/30 bg-warning/10 text-warning",
        info: "border-info/30 bg-info/10 text-info",
        // Categories with no status meaning, such as blog tags. The tint carries the category; the text stays in ink,
        // because several series hues fall below 4.5:1 at this size.
        "chart-1": "border-chart-1/30 bg-chart-1/10 text-foreground",
        "chart-2": "border-chart-2/30 bg-chart-2/10 text-foreground",
        "chart-3": "border-chart-3/30 bg-chart-3/10 text-foreground",
        "chart-4": "border-chart-4/30 bg-chart-4/10 text-foreground",
        "chart-5": "border-chart-5/30 bg-chart-5/10 text-foreground",
        "chart-6": "border-chart-6/30 bg-chart-6/10 text-foreground",
        "chart-7": "border-chart-7/30 bg-chart-7/10 text-foreground",
        "chart-8": "border-chart-8/30 bg-chart-8/10 text-foreground",
      },
      size: {
        default: "px-2 py-0.5 text-xs",
        sm: "px-1.5 py-px text-3xs",
      },
      shape: {
        pill: "rounded-full",
        square: "rounded-md tabular-nums",
        /** A fixed disc for one or two characters: a step number, a rank. */
        circle: "rounded-full px-0 py-0 tabular-nums",
      },
    },
    compoundVariants: [
      { shape: "circle", size: "default", class: "size-5" },
      { shape: "circle", size: "sm", class: "size-4" },
    ],
    defaultVariants: {
      variant: "default",
      size: "default",
      shape: "pill",
    },
  },
);

function Badge({
  className,
  variant = "default",
  size = "default",
  shape = "pill",
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      data-variant={variant}
      data-shape={shape}
      className={cn(badgeVariants({ variant, size, shape }), className)}
      {...props}
    />
  );
}

export { Badge };
