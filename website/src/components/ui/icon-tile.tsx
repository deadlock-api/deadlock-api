import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "~/lib/utils";

const iconTileVariants = cva("inline-flex shrink-0 items-center justify-center border [&_svg]:shrink-0", {
  variants: {
    tone: {
      muted: "bg-muted text-muted-foreground",
      primary: "border-primary/30 bg-primary/10 text-primary",
      positive: "border-positive/30 bg-positive/10 text-positive",
      negative: "border-negative/30 bg-negative/10 text-negative",
      warning: "border-warning/30 bg-warning/10 text-warning",
      info: "border-info/30 bg-info/10 text-info",
    },
    size: {
      xs: "size-6 [&_svg:not([class*='size-'])]:size-3",
      sm: "size-8 [&_svg:not([class*='size-'])]:size-4",
      default: "size-10 [&_svg:not([class*='size-'])]:size-5",
      lg: "size-12 [&_svg:not([class*='size-'])]:size-6",
    },
    shape: {
      square: "rounded-lg",
      circle: "rounded-full",
    },
    /** `card`: inside a pressable Card, the tile takes the brand tint while the card is hovered or focused. */
    hover: {
      none: "",
      card: "transition-colors group-hover/card:border-primary/30 group-hover/card:bg-primary/10 group-hover/card:text-primary group-focus-visible/card:border-primary/30 group-focus-visible/card:bg-primary/10 group-focus-visible/card:text-primary",
    },
  },
  compoundVariants: [{ shape: "square", size: "xs", class: "rounded-md" }],
  defaultVariants: { tone: "muted", size: "default", shape: "square", hover: "none" },
});

/** The framed icon that leads a feature card, a step or a list entry. Decorative: the text beside it names it. */
export function IconTile({
  tone,
  size,
  shape,
  hover,
  className,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof iconTileVariants>) {
  return (
    <span
      data-slot="icon-tile"
      aria-hidden="true"
      className={cn(iconTileVariants({ tone, size, shape, hover }), className)}
      {...props}
    />
  );
}
