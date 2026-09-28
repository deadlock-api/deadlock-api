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
      /** As tall as it is wide, up to the height of `lg`: round plots such as a radar. */
      square: "aspect-square max-h-105 w-full",
      /** The parent sets the height. */
      fill: "h-full",
      /**
       * Grows in a flex column (a panel stretched by its grid row) from a compact minimum: the plot takes the height
       * its row gives the panel.
       */
      grow: "h-full",
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
  /**
   * What assistive technology reads. `plot` (default): the label names the figure and the plot's own text (ticks,
   * keyboard readings) stays reachable. `label`: the label is a full summary that stands in for the plot, whose tick
   * text would otherwise be read as one run-together string; the plot is hidden from assistive technology, so it must
   * not be focusable (`accessibilityLayer={false}`).
   */
  announce?: "plot" | "label";
  /** The plot's size in pixels, for ticks and tooltips that must adapt to it. */
  onResize?: ComponentProps<typeof ResponsiveContainer>["onResize"];
  children: ComponentProps<typeof ResponsiveContainer>["children"];
}

/** The classes a `fill` or `grow` plot's outer element takes; the other sizes set the height on the plot itself. */
export function chartFrameHeight(size: ChartSize | null | undefined): string | undefined {
  if (size === "fill") return "h-full";
  if (size === "grow") return "min-h-32 flex-1";
  return undefined;
}

/** The frame every Recharts plot sits in: a labelled figure of a named height with a responsive container. */
export function ChartSurface({
  label,
  announce = "plot",
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
      aria-label={announce === "plot" ? label : undefined}
      className={cn(chartSurfaceVariants({ variant }), chartFrameHeight(size), className)}
      {...props}
    >
      {/* A caption names the figure and is read in browse mode too, where an aria-label on it may be skipped. */}
      {announce === "label" && (
        <figcaption data-slot="chart-surface-summary" className="sr-only">
          {label}
        </figcaption>
      )}
      {/* The figure is the container the height steps query, so the height sits on its child. */}
      <div
        data-slot="chart-surface-plot"
        aria-hidden={announce === "label" || undefined}
        className={cn(
          "min-w-0",
          size === "fill" || size === "grow" ? "min-h-0" : chartSizeVariants({ size }),
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
