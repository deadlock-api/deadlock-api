import { cva, type VariantProps } from "class-variance-authority";
import { cloneElement, type ComponentProps, isValidElement, type ReactElement, type ReactNode } from "react";
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
      /**
       * `default`'s height as a floor, growing in a flex column like `grow`: the main plot of a panel that sits beside
       * another. A taller header or a picker in one panel then takes height from the plot, not from its position, so
       * the neighbours' x-axes stay on one line; alone or stacked, the plot keeps the default height.
       */
      stretch: "h-full",
    },
  },
  defaultVariants: { size: "default" },
});

// Recharts focuses its marks on click, which would outline them; keyboard focus (`accessibilityLayer`) keeps its outline.
const chartSurfaceVariants = cva(
  // A pressable mark (`ChartPointMark pressable`) takes the pointer cursor here, not from an inline style.
  "@container grid min-w-0 grid-cols-1 select-none [&_*:focus:not(:focus-visible)]:outline-none [&_[data-pressable]]:cursor-pointer",
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
   * What assistive technology reads. `plot` (default): the label names the figure and the chart's focusable svg, and
   * the plot's own text (ticks, keyboard readings, announced through `TooltipCard`'s live region) stays reachable. `label`: the label is a full summary that stands in for the plot, whose tick
   * text would otherwise be read as one run-together string; the plot is hidden from assistive technology, so it must
   * not be focusable (`accessibilityLayer={false}`).
   */
  announce?: "plot" | "label";
  /**
   * With `announce="label"`: the plot's numbers for assistive technology, a `ChartDataTable`, read after the summary.
   */
  dataTable?: ReactNode;
  /** The plot's size in pixels, for ticks and tooltips that must adapt to it. */
  onResize?: ComponentProps<typeof ResponsiveContainer>["onResize"];
  children: ComponentProps<typeof ResponsiveContainer>["children"];
}

/** The classes a `fill`, `grow` or `stretch` plot's outer element takes; the other sizes set the height on the plot. */
export function chartFrameHeight(size: ChartSize | null | undefined): string | undefined {
  if (size === "fill") return "h-full";
  if (size === "grow") return "min-h-32 flex-1";
  if (size === "stretch") return "min-h-70 flex-1";
  return undefined;
}

/**
 * Names the chart's own svg too: with Recharts' accessibility layer it is a focusable `application`, and focus lands
 * on it rather than on the figure, so an unnamed one would be read as nothing. A chart that names itself keeps its name.
 */
function namePlot(children: ChartSurfaceProps["children"], label: string): ChartSurfaceProps["children"] {
  if (!isValidElement<{ "aria-label"?: string }>(children) || children.props["aria-label"]) return children;
  return cloneElement(children as ReactElement<{ "aria-label"?: string }>, { "aria-label": label });
}

/** The frame every Recharts plot sits in: a labelled figure of a named height with a responsive container. */
export function ChartSurface({
  label,
  announce = "plot",
  dataTable,
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
      {announce === "label" && dataTable}
      {/* The figure is the container the height steps query, so the height sits on its child. */}
      <div
        data-slot="chart-surface-plot"
        aria-hidden={announce === "label" || undefined}
        className={cn(
          "min-w-0",
          size === "fill" || size === "grow" || size === "stretch" ? "min-h-0" : chartSizeVariants({ size }),
          variant !== "bare" && "p-2",
        )}
      >
        <ResponsiveContainer width="100%" height="100%" onResize={onResize}>
          {announce === "plot" ? namePlot(children, label) : children}
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
