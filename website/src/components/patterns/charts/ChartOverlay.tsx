import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "~/lib/utils";

/**
 * The box around a `ChartStage` whose overlays leave the plot when it is narrow. Its children are, in order, the
 * top overlays, the stage and the bottom overlays, each overlay with `narrow="outside"`: from `@lg` they float over
 * the stage as usual; below it they stack above and below it, so a legend or a slider never covers a map that fills
 * a phone's width. The stage (or the one box that holds it) takes the height the overlays leave.
 */
export function ChartStageFrame({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="chart-stage-frame"
      className={cn(
        "@container/chart-stage relative flex size-full min-w-0 flex-col gap-2 *:not-data-[slot=chart-overlay]:min-h-0 *:not-data-[slot=chart-overlay]:flex-1",
        className,
      )}
      {...props}
    />
  );
}

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

const chartOverlayVariants = cva("z-10 flex max-w-full flex-col gap-1.5", {
  variants: {
    position: {
      "top-start": "inset-s-3 top-3 items-start self-start",
      "top-end": "inset-e-3 top-3 items-end self-end",
      "bottom-start": "inset-s-3 bottom-3 items-start self-start",
      "bottom-end": "inset-e-3 bottom-3 items-end self-end",
    },
    /**
     * What the overlay does in a narrow plot. `over` always floats in its corner. `outside` floats from `@lg` of the
     * enclosing `ChartStageFrame` and below it sits in the frame's flow, above or below the stage.
     */
    narrow: {
      over: "absolute",
      outside: "static @lg/chart-stage:absolute",
    },
  },
  defaultVariants: { position: "bottom-end", narrow: "over" },
});

/**
 * A stack of controls or keys floating in a corner of a plot. It is an overlay, so it is absolute by nature: its
 * parent is a `ChartStage` (or any `relative` box) and `position` names the corner; in a `ChartStageFrame`,
 * `narrow="outside"` moves it out of a plot too narrow to share. Put
 * each control in a `ChartOverlayItem`; a bare line of text is a hint such as "Drag to rotate".
 */
export function ChartOverlay({
  position = "bottom-end",
  narrow = "over",
  className,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof chartOverlayVariants>) {
  return (
    <div
      data-slot="chart-overlay"
      data-narrow={narrow}
      className={cn(chartOverlayVariants({ position, narrow }), "text-3xs text-muted-foreground", className)}
      {...props}
    />
  );
}

const REGION_TONE = {
  positive: "bg-positive/8",
  negative: "bg-negative/8",
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
  tone = "positive",
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
