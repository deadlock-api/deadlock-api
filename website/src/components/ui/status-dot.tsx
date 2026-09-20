import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "~/lib/utils";

const statusDotVariants = cva("inline-block size-2 shrink-0 rounded-full", {
  variants: {
    tone: {
      muted: "bg-muted-foreground",
      primary: "bg-primary",
    },
  },
  defaultVariants: { tone: "muted" },
});

/**
 * A dot of state beside a label: live, idle, failed; or the swatch of a series with `color`. Always decorative, so
 * the text beside it must say the same thing.
 */
export function StatusDot({
  tone,
  ring = "none",
  color,
  className,
  style,
  ...props
}: Omit<React.ComponentProps<"span">, "children"> &
  VariantProps<typeof statusDotVariants> & {
    /** `surface` puts a hairline halo of the page behind the dot, so it stays readable on top of artwork. */
    ring?: "none" | "surface";
    /** A CSS color that comes from data, such as a lane or a hero. Replaces the tone. */
    color?: string;
  }) {
  return (
    <span
      data-slot="status-dot"
      aria-hidden
      style={color ? { backgroundColor: color, ...style } : style}
      className={cn(statusDotVariants({ tone }), ring === "surface" && "ring-1 ring-background", className)}
      {...props}
    />
  );
}
