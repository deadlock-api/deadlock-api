import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { ResponsiveContainer } from "recharts";

import { cn } from "~/lib/utils";

/**
 * Plot heights. Every chart picks one; the loading skeleton takes the same one so nothing jumps. `default`, `lg` and `xl`
 * step up with the width of the nearest `@container` ancestor, so the element that carries them sits inside one.
 */
export const chartSizeVariants = cva("", {
  variants: {
    size: {
      xs: "h-20",
      sm: "h-24",
      md: "h-55",
      default: "h-70 @xl:h-80",
      lg: "h-90 @xl:h-105",
      xl: "h-105 @xl:h-140",
      /** The parent sets the height. */
      fill: "h-full",
    },
  },
  defaultVariants: { size: "default" },
});

// Recharts focuses its marks on click, which would outline them; keyboard focus (`accessibilityLayer`) keeps its outline.
const chartSurfaceVariants = cva(
  "@container grid min-w-0 grid-cols-1 select-none [&_*:focus:not(:focus-visible)]:outline-none",
  {
    variants: {
      variant: {
        /** A standalone plot. */
        card: "rounded-xl border bg-card",
        /** Inside a ChartCard or Panel, which already draws the surface. */
        flush: "",
        /** No chrome or padding: sparklines, plots inside a table cell or tooltip. */
        bare: "",
      },
    },
    defaultVariants: { variant: "card" },
  },
);

export type ChartSize = NonNullable<VariantProps<typeof chartSizeVariants>["size"]>;

interface ChartSurfaceProps
  extends
    Omit<ComponentProps<"figure">, "children" | "onResize">,
    VariantProps<typeof chartSizeVariants>,
    VariantProps<typeof chartSurfaceVariants> {
  /** Describes the plot to assistive technology: "Win rate by rank". */
  label: string;
  /** The plot's size in pixels, for ticks and tooltips that must adapt to it. */
  onResize?: ComponentProps<typeof ResponsiveContainer>["onResize"];
  children: ComponentProps<typeof ResponsiveContainer>["children"];
}

/** The frame every Recharts plot sits in: a labelled figure of a named height with a responsive container. */
export function ChartSurface({
  label,
  size = "default",
  variant = "card",
  className,
  onResize,
  children,
  ...props
}: ChartSurfaceProps) {
  return (
    <figure
      data-slot="chart-surface"
      aria-label={label}
      className={cn(chartSurfaceVariants({ variant }), size === "fill" && "h-full", className)}
      {...props}
    >
      {/* The figure is the container the height steps query, so the height sits on its child. */}
      <div
        data-slot="chart-surface-plot"
        className={cn(
          "min-w-0",
          size === "fill" ? "min-h-0" : chartSizeVariants({ size }),
          variant !== "bare" && "p-2",
        )}
      >
        <ResponsiveContainer width="100%" height="100%" onResize={onResize}>
          {children}
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
