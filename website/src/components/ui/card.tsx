import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import * as React from "react";

import { DISABLED_STATE, FOCUS_RING_BORDER } from "~/components/ui/recipes";
import { cn } from "~/lib/utils";

/**
 * The one surface. `size` sets the padding and gap of every part at once: `default` for content pages, `sm` for
 * dashboard panels, `xs` for dense tiles. `tone` picks the material.
 */
const cardVariants = cva("group/card flex min-w-0 flex-col text-card-foreground", {
  variants: {
    tone: {
      card: "border bg-card shadow-sm",
      glass: "border border-hairline bg-subtle",
      inset: "border bg-background",
      /** A border and nothing else, for a tile nested inside a Card or Panel. */
      outline: "border",
      muted: "bg-muted/50",
      /** A widget that floats over content it does not belong to: a map legend, a graph toolbar, a sticky bar. */
      floating: "border bg-popover/90 text-popover-foreground shadow-lg backdrop-blur-md",
      primary: "border border-primary/30 bg-primary/5",
      positive: "border border-positive/30 bg-positive/5",
      warning: "border border-warning/30 bg-warning/5",
      info: "border border-info/30 bg-info/5",
      negative: "border border-negative/30 bg-negative/5",
      destructive: "border border-destructive/30 bg-destructive/5",
    },
    size: {
      default: "gap-6 rounded-xl py-6",
      sm: "gap-3 rounded-xl py-3",
      xs: "gap-2 rounded-lg py-2",
      flush: "gap-0 overflow-hidden rounded-xl py-0",
    },
    /** A surface nested in another steps its corners down: `lg` inside a card, `md` inside that. */
    radius: {
      default: "",
      lg: "rounded-lg",
      md: "rounded-md",
    },
    /** `pressable`: the whole card is one link or button (`asChild`), so it answers to hover and focus. */
    interaction: {
      none: "",
      pressable: [
        FOCUS_RING_BORDER,
        DISABLED_STATE,
        "transition-colors duration-fast ease-standard hover:border-primary/40 hover:bg-muted/50 active:bg-muted aria-disabled:pointer-events-none aria-disabled:opacity-50",
      ],
    },
  },
  defaultVariants: { tone: "card", size: "default", radius: "default", interaction: "none" },
});

function Card({
  className,
  tone = "card",
  size = "default",
  radius,
  interaction = "none",
  asChild = false,
  accent,
  style,
  ...props
}: React.ComponentProps<"div"> &
  VariantProps<typeof cardVariants> & {
    asChild?: boolean;
    /** A CSS color that identifies the card's group, drawn as a stripe along its top edge. */
    accent?: string;
  }) {
  const Comp = asChild ? Slot.Root : "div";
  return (
    <Comp
      data-slot="card"
      data-interaction={interaction}
      data-size={size}
      data-tone={tone}
      style={accent ? { borderTopColor: accent, ...style } : style}
      className={cn(cardVariants({ tone, size, radius, interaction }), accent && "border-t-2", className)}
      {...props}
    />
  );
}

const inset = "px-6 group-data-[size=sm]/card:px-3 group-data-[size=xs]/card:px-2.5 group-data-[size=flush]/card:px-3";

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6",
        "group-data-[size=flush]/card:gap-0.5 group-data-[size=flush]/card:border-b group-data-[size=flush]/card:py-2 group-data-[size=sm]/card:gap-1 group-data-[size=xs]/card:gap-0.5 group-data-[size=sm]/card:[.border-b]:pb-3 group-data-[size=xs]/card:[.border-b]:pb-2",
        inset,
        className,
      )}
      {...props}
    />
  );
}

function CardTitle({
  as: Tag = "div",
  className,
  ...props
}: React.ComponentProps<"div"> & {
  /** A heading level when the title belongs in the document outline; the look does not change. */
  as?: "div" | "h2" | "h3" | "h4";
}) {
  return (
    <Tag
      data-slot="card-title"
      className={cn(
        "leading-none font-semibold group-data-[size=flush]/card:text-sm group-data-[size=sm]/card:text-sm group-data-[size=xs]/card:text-xs",
        className,
      )}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn(
        "text-sm text-muted-foreground group-data-[size=flush]/card:text-xs group-data-[size=sm]/card:text-xs group-data-[size=xs]/card:text-xs",
        className,
      )}
      {...props}
    />
  );
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn("col-start-2 row-span-2 row-start-1 self-start justify-self-end", className)}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="card-content" className={cn(inset, "group-data-[size=flush]/card:px-0", className)} {...props} />
  );
}

export { Card, CardHeader, CardTitle, CardAction, CardDescription, CardContent, cardVariants };
