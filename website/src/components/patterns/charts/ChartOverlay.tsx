import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "~/lib/utils";

/** The rounded, clipped box around a canvas, a map or a WebGL scene that carries `ChartOverlay`s. */
export function ChartStage({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="chart-stage"
      className={cn("relative size-full min-w-0 overflow-hidden rounded-lg", className)}
      {...props}
    />
  );
}

const chartOverlayVariants = cva("absolute z-10 flex max-w-full flex-col gap-1.5", {
  variants: {
    position: {
      "top-start": "start-3 top-3 items-start",
      "top-end": "end-3 top-3 items-end",
      "bottom-start": "start-3 bottom-3 items-start",
      "bottom-end": "end-3 bottom-3 items-end",
    },
  },
  defaultVariants: { position: "bottom-end" },
});

/**
 * A stack of controls or keys floating in a corner of a plot. It is an overlay, so it is absolute by nature: its
 * parent is a `ChartStage` (or any `relative` box) and `position` names the corner. Put
 * each control in a `ChartOverlayItem`; a bare line of text is a hint such as "Drag to rotate".
 */
export function ChartOverlay({
  position,
  className,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof chartOverlayVariants>) {
  return (
    <div
      data-slot="chart-overlay"
      className={cn(chartOverlayVariants({ position }), "text-3xs text-muted-foreground", className)}
      {...props}
    />
  );
}

const REGION_TONE = {
  positive: "bg-positive/8",
  negative: "bg-negative/8",
  warning: "bg-warning/8",
  info: "bg-info/8",
  muted: "bg-muted/40",
} as const;

interface ChartRegionProps extends Omit<React.ComponentProps<"div">, "children"> {
  /** What the area means: the quadrant where both measures are good, the one where neither is. */
  tone?: keyof typeof REGION_TONE;
  /** Where the band starts and ends inside the stage, as percentages of its box. */
  start?: number;
  end?: number;
  top?: number;
  bottom?: number;
  /** A quiet name printed in the region's leading corner, so the tint is not the only signal. */
  label?: React.ReactNode;
}

/**
 * A tinted area of a plot: the quadrant of a scatter where a hero is both picked and winning, the band of a trend
 * that is below par. It sits under the marks and is never the only thing saying what the area means, so it carries
 * a `label`. The edges are percentages of the `ChartStage` and are logical, so they mirror in RTL.
 */
export function ChartRegion({
  tone = "muted",
  start = 0,
  end = 0,
  top = 0,
  bottom = 0,
  label,
  className,
  style,
  ...props
}: ChartRegionProps) {
  return (
    <div
      data-slot="chart-region"
      data-tone={tone}
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute flex items-start p-1.5 text-3xs text-muted-foreground",
        REGION_TONE[tone],
        className,
      )}
      style={{
        insetInlineStart: `${start}%`,
        insetInlineEnd: `${end}%`,
        top: `${top}%`,
        bottom: `${bottom}%`,
        ...style,
      }}
      {...props}
    >
      {label}
    </div>
  );
}

/** One glass pill of an overlay: a legend, a slider with its label and value. */
export function ChartOverlayItem({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="chart-overlay-item"
      className={cn("glass flex min-w-0 items-center gap-1.5 rounded-lg px-3 py-1.5", className)}
      {...props}
    />
  );
}
