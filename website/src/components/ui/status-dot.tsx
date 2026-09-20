import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "~/lib/utils";

const statusDotVariants = cva("relative inline-block shrink-0 rounded-full", {
  variants: {
    tone: {
      muted: "bg-muted-foreground",
      primary: "bg-primary",
      positive: "bg-positive",
      negative: "bg-negative",
      warning: "bg-warning",
      info: "bg-info",
    },
    size: {
      sm: "size-1.5",
      default: "size-2",
      lg: "size-2.5",
    },
  },
  defaultVariants: { tone: "muted", size: "default" },
});

/**
 * A dot of state beside a label: live, idle, failed; or the swatch of a series with `color`. Decorative unless it
 * gets a `label`, so the text beside it must say the same thing.
 */
export function StatusDot({
  tone,
  size,
  ring = "none",
  motion = "none",
  color,
  label,
  className,
  style,
  ...props
}: Omit<React.ComponentProps<"span">, "children"> &
  VariantProps<typeof statusDotVariants> & {
    /** `surface` puts a hairline halo of the page behind the dot, so it stays readable on top of artwork. */
    ring?: "none" | "surface";
    /** `pulse` radiates a ring from the dot, for a state that is happening now. */
    motion?: "none" | "pulse";
    /** A CSS color that comes from data, such as a lane or a hero. Replaces the tone. */
    color?: string;
    /** Makes the dot an image with this name, for a dot that stands alone. */
    label?: string;
  }) {
  return (
    <span
      data-slot="status-dot"
      data-motion={motion}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      style={color ? { backgroundColor: color, ...style } : style}
      className={cn(statusDotVariants({ tone, size }), ring === "surface" && "ring-1 ring-background", className)}
      {...props}
    >
      {motion === "pulse" && (
        <span className="absolute inset-0 animate-ping rounded-full bg-inherit opacity-75 motion-reduce:animate-none" />
      )}
    </span>
  );
}
