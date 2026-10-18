import { createContext, useContext } from "react";

import { CHART_SPREAD_BAND } from "~/components/patterns/charts/theme";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

type SwatchShape = "line" | "dashed" | "dotted" | "square" | "band" | "dot" | "ring" | "triangle-up" | "triangle-down";

const shapeClass: Record<SwatchShape, string> = {
  line: "h-0.5 w-4 rounded-full",
  dashed: "h-0 w-4 border-t-2 border-dashed bg-transparent",
  dotted: "h-0 w-4 border-t-2 border-dotted bg-transparent",
  square: "size-2.5 rounded-xs",
  band: "h-2.5 w-4 rounded-xs border",
  dot: "size-2 rounded-full",
  ring: "size-2.5 rounded-full border-2 bg-transparent",
  "triangle-up": "size-2.5 [clip-path:polygon(50%_0,100%_100%,0_100%)]",
  "triangle-down": "size-2.5 [clip-path:polygon(0_0,100%_0,50%_100%)]",
};
const smallShapeClass: Record<SwatchShape, string> = {
  line: "h-0.5 w-3 rounded-full",
  dashed: "h-0 w-3 border-t-2 border-dashed bg-transparent",
  dotted: "h-0 w-3 border-t-2 border-dotted bg-transparent",
  square: "size-2 rounded-xs",
  band: "h-2 w-3 rounded-xs border",
  dot: "size-1.5 rounded-full",
  ring: "size-2 rounded-full border-2 bg-transparent",
  "triangle-up": "size-2 [clip-path:polygon(50%_0,100%_100%,0_100%)]",
  "triangle-down": "size-2 [clip-path:polygon(0_0,100%_0,50%_100%)]",
};

/**
 * The mark of one series, wherever it is named: a legend, a tooltip row, a table cell. Match the shape to the mark:
 * `line` for lines and areas, `dashed` for a dashed reference line (a median, an average), `dotted` for a dotted one (the quartiles, `CHART_QUARTILE_LINE`), `square` for bars and stacks, `band` for a shaded range (the `CHART_SPREAD_BAND` around an average: its fill, edged in the color), `dot` for points, `ring` for hollow points, `triangle-up` / `triangle-down` for the points of `VERDICT_MARK`.
 */
export function ChartSwatch({
  color,
  shape = "square",
  size = "default",
  className,
  style,
  ...props
}: Omit<React.ComponentProps<"span">, "children" | "color"> & {
  /** A CSS color: a token such as `var(--chart-2)`, or a hero or rank color from the assets API. */
  color: string;
  shape?: SwatchShape;
  size?: "sm" | "default";
}) {
  return (
    <span
      data-slot="chart-swatch"
      aria-hidden="true"
      // In forced colors (Windows high contrast) the swatch keeps its color, as the plotted series does.
      className={cn(
        "inline-block shrink-0 forced-color-adjust-none",
        (size === "sm" ? smallShapeClass : shapeClass)[shape],
        className,
      )}
      style={
        shape === "ring" || shape === "dashed" || shape === "dotted"
          ? { borderColor: color, ...style }
          : shape === "band"
            ? {
                borderColor: color,
                backgroundColor: `color-mix(in srgb, ${color} ${CHART_SPREAD_BAND.fillOpacity * 100}%, transparent)`,
                ...style,
              }
            : { backgroundColor: color, ...style }
      }
      {...props}
    />
  );
}

interface ChartLegendItemProps extends Omit<React.ComponentProps<"li">, "color"> {
  /** A CSS color: a token such as `var(--chart-2)`, or a hero or rank color from the assets API. */
  color: string;
  /** Match the mark: `line` for line and area series, `square` for bars and stacks, `dot` for points. */
  shape?: SwatchShape;
  /** Replaces the swatch, for a layer drawn with a glyph rather than a color. */
  icon?: React.ReactNode;
  /**
   * `pending`: the series is on its way (a reference refetching for new filters). The item stays, so the legend never
   * re-wraps, with its swatch faded and "loading" for a screen reader.
   */
  state?: "ready" | "pending";
}

const LegendSizeContext = createContext<"sm" | "default">("default");

/** One series of a `ChartLegend`; children are its label. */
export function ChartLegendItem({
  color,
  shape,
  icon,
  state = "ready",
  className,
  children,
  ...props
}: ChartLegendItemProps) {
  const size = useContext(LegendSizeContext);
  return (
    <li
      data-slot="chart-legend-item"
      data-state={state}
      className={cn(
        "flex items-center gap-1.5 data-[state=pending]:[&>[data-slot=chart-swatch]]:opacity-40",
        className,
      )}
      {...props}
    >
      {icon ?? <ChartSwatch color={color} shape={shape} size={size} />}
      {children}
      {state === "pending" && <span className="sr-only"> (loading)</span>}
    </li>
  );
}

interface ChartLegendToggleProps extends Omit<React.ComponentProps<"button">, "color" | "type"> {
  /** A CSS color: a token such as `var(--chart-2)`, or a player's or hero's series color. */
  color: string;
  shape?: SwatchShape;
  /** The series is singled out and stays so until pressed again. */
  pressed?: boolean;
  onPressedChange?: (pressed: boolean) => void;
  /** Hover or focus enters (true) or leaves (false) the item: a passing highlight of its series. */
  onHighlight?: (highlighted: boolean) => void;
}

/**
 * A series of a `ChartLegend` the reader can single out: hovering or focusing it highlights the series in the plot,
 * pressing it keeps the highlight (a toggle button, `aria-pressed`), which is how touch and keyboard pin one.
 * Drive it with `useSeriesHighlight`. Children are its label.
 */
export function ChartLegendToggle({
  color,
  shape,
  pressed = false,
  onPressedChange,
  onHighlight,
  onClick,
  onPointerEnter,
  onPointerLeave,
  onFocus,
  onBlur,
  className,
  children,
  ...props
}: ChartLegendToggleProps) {
  const size = useContext(LegendSizeContext);
  return (
    <li data-slot="chart-legend-item" className="flex min-w-0">
      <Button
        type="button"
        variant="toggle"
        size="xs"
        data-slot="chart-legend-toggle"
        aria-pressed={pressed}
        // A legend row, not a pill: it keeps the legend's type and wraps or truncates a long label.
        className={cn(
          "h-auto min-h-6 min-w-0 shrink justify-start gap-1.5 text-start font-normal whitespace-normal",
          className,
        )}
        onClick={(event) => {
          onClick?.(event);
          if (!event.defaultPrevented) onPressedChange?.(!pressed);
        }}
        onPointerEnter={(event) => {
          onPointerEnter?.(event);
          onHighlight?.(true);
        }}
        onPointerLeave={(event) => {
          onPointerLeave?.(event);
          onHighlight?.(false);
        }}
        onFocus={(event) => {
          onFocus?.(event);
          onHighlight?.(true);
        }}
        onBlur={(event) => {
          onBlur?.(event);
          onHighlight?.(false);
        }}
        {...props}
      >
        <ChartSwatch color={color} shape={shape} size={size} />
        {children}
      </Button>
    </li>
  );
}

/** The key to a chart's series. Text stays in ink; only the swatch carries the series color. */
export function ChartLegend({
  label = "Legend",
  size = "default",
  orientation = "horizontal",
  className,
  children,
  ...props
}: React.ComponentProps<"ul"> & {
  label?: string;
  size?: "sm" | "default";
  /** `vertical`: one series a row, full width, for a key beside the plot; long labels truncate instead of wrapping. */
  orientation?: "horizontal" | "vertical";
}) {
  return (
    <LegendSizeContext.Provider value={size}>
      <ul
        data-slot="chart-legend"
        data-size={size}
        data-orientation={orientation}
        aria-label={label}
        className={cn(
          "flex text-muted-foreground",
          orientation === "vertical" ? "flex-col items-stretch" : "flex-wrap items-center",
          size === "sm" ? "gap-x-3 gap-y-0.5 text-xs" : "gap-x-4 gap-y-1 px-1 text-xs",
          className,
        )}
        {...props}
      >
        {children}
      </ul>
    </LegendSizeContext.Provider>
  );
}

function GradientRamp({ stops, size = "full" }: { stops: readonly string[]; size?: "full" | "half" }) {
  return (
    <span
      aria-hidden="true"
      data-slot="chart-gradient-ramp"
      className={cn("h-2.5 rounded-full", size === "half" ? "w-10" : "w-24")}
      style={{ background: `linear-gradient(to right, ${stops.join(", ")})` }}
    />
  );
}

/**
 * The key to a continuous color scale: its name, the low label, the ramp, the high label. `mid` splits the ramp at
 * its centre with the value there (the 1x of a diverging ramp), so its neutral point is read, not guessed.
 */
export function ChartGradientLegend({
  stops,
  min,
  max,
  mid,
  label = "Color scale",
  labelDisplay = "hidden",
  clipped = false,
  className,
  ...props
}: Omit<React.ComponentProps<"div">, "children"> & {
  /** CSS colors from low to high. They come from the plot's own palette, which may be a canvas ramp. */
  stops: readonly string[];
  min: React.ReactNode;
  max: React.ReactNode;
  /** The value at the centre of the ramp, printed between its halves. */
  mid?: React.ReactNode;
  /** What the colors measure: "Kills". */
  label?: string;
  /** `visible` prints the label before the scale (a plot whose measure changes with a view); `hidden` only names it. */
  labelDisplay?: "visible" | "hidden";
  /** The top of the ramp is a cap, not the largest value: values above it share its color. The max reads "≥N". */
  clipped?: boolean;
}) {
  const half = Math.ceil(stops.length / 2);
  return (
    <div
      data-slot="chart-gradient-legend"
      data-clipped={clipped || undefined}
      className={cn(
        "flex items-center gap-1.5 text-xs whitespace-nowrap text-muted-foreground tabular-nums",
        className,
      )}
      {...props}
    >
      <span className={labelDisplay === "visible" ? "text-foreground" : "sr-only"}>{label}</span>
      <span className="sr-only">, from</span>
      <span>{min}</span>
      <span className="sr-only">to</span>
      {mid == null ? (
        <GradientRamp stops={stops} />
      ) : (
        <>
          <GradientRamp size="half" stops={stops.slice(0, half)} />
          <span className="sr-only">through</span>
          <span>{mid}</span>
          <GradientRamp size="half" stops={stops.slice(stops.length - half)} />
        </>
      )}
      <span>
        {clipped && (
          <>
            <span aria-hidden="true">≥</span>
            <span className="sr-only">at least </span>
          </>
        )}
        {max}
      </span>
    </div>
  );
}
