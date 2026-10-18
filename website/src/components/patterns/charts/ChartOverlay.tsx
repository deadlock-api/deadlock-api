import { cva, type VariantProps } from "class-variance-authority";

import { Field } from "~/components/ui/field";
import { Slider } from "~/components/ui/slider";
import { cn } from "~/lib/utils";

const chartStageFrameVariants = cva(
  "@container/chart-stage relative flex size-full min-w-0 flex-col gap-2 *:not-data-[slot=chart-overlay]:min-h-0 *:not-data-[slot=chart-overlay]:flex-1",
  {
    variants: {
      /**
       * How the stage is sized. `fill`: it takes the height the overlays leave. `square`: the same from `@3xl`; below
       * it (a phone, where the page scrolls anyway) it is as tall as it is wide, so a round map fills the width
       * instead of shrinking to the height left under the filters.
       */
      fit: {
        fill: "",
        square:
          "@max-3xl/chart-stage:*:not-data-[slot=chart-overlay]:aspect-square @max-3xl/chart-stage:*:not-data-[slot=chart-overlay]:h-auto @max-3xl/chart-stage:*:not-data-[slot=chart-overlay]:flex-none",
      },
    },
    defaultVariants: { fit: "fill" },
  },
);

/**
 * The box around a `ChartStage` whose overlays leave the plot when it is narrow. Its children are, in order, the
 * top overlays, the stage and the bottom overlays, each overlay with `narrow="outside"`: from `@3xl` they float over
 * the stage as usual; below it they stack above and below it, so a legend or a slider never covers a map that fills
 * a phone's width. The stage (or the one box that holds it) takes the height the overlays leave, or with
 * `fit="square"` its own width below `@3xl`.
 */
export function ChartStageFrame({
  fit = "fill",
  className,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof chartStageFrameVariants>) {
  return (
    <div
      data-slot="chart-stage-frame"
      data-fit={fit}
      className={cn(chartStageFrameVariants({ fit }), className)}
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
      /** Over the whole stage, centred: a state the plot is in, such as a choice it still needs. */
      center: "inset-0 items-center justify-center p-3 text-center",
    },
    /**
     * What the overlay does in a narrow plot. `over` always floats in its corner. `outside` floats from `@3xl` of the
     * enclosing `ChartStageFrame` and below it sits in the frame's flow, above or below the stage.
     */
    narrow: {
      over: "absolute",
      // A square map in a frame narrower than 48rem fills its width, so a floating key or slider covered its lanes.
      outside: "static @3xl/chart-stage:absolute",
    },
    /**
     * `stack`: items one under another, each as wide as it needs. `rows`: a grid whose `ChartOverlaySlider`s share
     * their label, track and value columns, so the tracks line up.
     */
    layout: {
      stack: "",
      rows: "grid grid-cols-[auto_auto_auto]",
    },
  },
  defaultVariants: { position: "bottom-end", narrow: "over", layout: "stack" },
});

/**
 * A stack of controls or keys floating in a corner of a plot. It is an overlay, so it is absolute by nature: its
 * parent is a `ChartStage` (or any `relative` box) and `position` names the corner; in a `ChartStageFrame`,
 * `narrow="outside"` moves it out of a plot too narrow to share. Put each key in a `ChartOverlayItem` and each slider
 * in a `ChartOverlaySlider` (with `layout="rows"`). It holds keys and controls only, never a line of how-to text.
 */
export function ChartOverlay({
  position = "bottom-end",
  narrow = "over",
  layout = "stack",
  className,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof chartOverlayVariants>) {
  return (
    <div
      data-slot="chart-overlay"
      data-narrow={narrow}
      data-layout={layout}
      className={cn(
        chartOverlayVariants({ position, narrow, layout }),
        position === "center" ? "text-sm text-foreground" : "text-xs text-muted-foreground",
        className,
      )}
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
        "pointer-events-none absolute flex items-start p-1.5 text-xs text-muted-foreground",
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

const chartAxisTitleVariants = cva("text-xs text-muted-foreground", {
  variants: {
    /** `x` runs under the plot, centred. `y` runs up the start edge, read from bottom to top. */
    axis: {
      x: "text-center",
      y: "flex rotate-180 items-center justify-center self-stretch [writing-mode:vertical-rl]",
    },
  },
  defaultVariants: { axis: "x" },
});

/**
 * What an axis of a bespoke plot (a `ChartStage` of positioned marks) measures: "Synergy with your picks →". Recharts
 * charts take theirs from `CHART_X_LABEL` / `CHART_Y_LABEL`. Place an `x` title under the tick labels and a `y` title
 * in a column beside the stage; the arrow says which way is more.
 */
export function ChartAxisTitle({
  axis = "x",
  className,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof chartAxisTitleVariants>) {
  return (
    <div
      data-slot="chart-axis-title"
      data-axis={axis}
      className={cn(chartAxisTitleVariants({ axis }), className)}
      {...props}
    />
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

interface ChartOverlaySliderProps extends Omit<React.ComponentProps<"div">, "onChange" | "defaultValue"> {
  /** Names the slider and is printed before its track. */
  label: string;
  value: number;
  onValueChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  /** The value as printed after the track and announced: "99.0%". */
  format: (value: number) => string;
  /**
   * Shown but not in use, as when the view has no use for it: out of the tab order, announced as unavailable, its
   * label and value dimmed. The row keeps its place, so the plot does not move when the view switches.
   */
  disabled?: boolean;
}

/**
 * One slider of a plot overlay in its own glass pill: the label, an 80px track and the value in a fixed column. In a
 * `ChartOverlay layout="rows"` the pills share their columns, so their tracks line up.
 */
export function ChartOverlaySlider({
  label,
  value,
  onValueChange,
  min,
  max,
  step = 1,
  format,
  disabled = false,
  className,
  ...props
}: ChartOverlaySliderProps) {
  return (
    <ChartOverlayItem className={cn("col-span-3 grid grid-cols-subgrid", className)} {...props}>
      <Field
        orientation="horizontal"
        label={label}
        aria-disabled={disabled || undefined}
        data-disabled={disabled || undefined}
        className="col-span-3 grid grid-cols-subgrid data-disabled:[&>:not([data-slot=slider])]:opacity-50"
      >
        <Slider
          aria-label={label}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          value={[value]}
          onValueChange={([next]) => onValueChange(next)}
          getValueText={format}
          className="w-20"
        />
        <span data-slot="chart-overlay-slider-value" className="w-12 text-end tabular-nums">
          {format(value)}
        </span>
      </Field>
    </ChartOverlayItem>
  );
}
