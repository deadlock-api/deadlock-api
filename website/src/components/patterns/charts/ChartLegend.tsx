import { createContext, useContext } from "react";

import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

type SwatchShape = "line" | "square" | "dot" | "ring";

const shapeClass: Record<SwatchShape, string> = {
  line: "h-0.5 w-4 rounded-full",
  square: "size-2.5 rounded-xs",
  dot: "size-2 rounded-full",
  ring: "size-2.5 rounded-full border-2 bg-transparent",
};
const smallShapeClass: Record<SwatchShape, string> = {
  line: "h-0.5 w-3 rounded-full",
  square: "size-2 rounded-xs",
  dot: "size-1.5 rounded-full",
  ring: "size-2 rounded-full border-2 bg-transparent",
};

/**
 * The mark of one series, wherever it is named: a legend, a tooltip row, a table cell. Match the shape to the mark:
 * `line` for lines and areas, `square` for bars and stacks, `dot` for points, `ring` for hollow points.
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
      className={cn("inline-block shrink-0", (size === "sm" ? smallShapeClass : shapeClass)[shape], className)}
      style={shape === "ring" ? { borderColor: color, ...style } : { backgroundColor: color, ...style }}
      {...props}
    />
  );
}

export interface ChartLegendItemProps extends Omit<React.ComponentProps<"li">, "color"> {
  /** A CSS color: a token such as `var(--chart-2)`, or a hero or rank color from the assets API. */
  color: string;
  /** Match the mark: `line` for line and area series, `square` for bars and stacks, `dot` for points. */
  shape?: SwatchShape;
  /** Replaces the swatch, for a layer drawn with a glyph rather than a color. */
  icon?: React.ReactNode;
  /** The series is switched off. Only meaningful with `onToggle`. */
  hidden?: boolean;
  /** Makes the entry a toggle button that shows or hides its series. */
  onToggle?: () => void;
  /** Names the toggle for assistive technology when the label is not text. */
  toggleLabel?: string;
}

const LegendSizeContext = createContext<"sm" | "default">("default");

/**
 * One series of a `ChartLegend`; children are its label. With `onToggle` it is a button: a hidden series is struck
 * through, never removed, so it can be brought back.
 */
export function ChartLegendItem({
  color,
  shape,
  icon,
  hidden = false,
  onToggle,
  toggleLabel,
  className,
  children,
  ...props
}: ChartLegendItemProps) {
  const size = useContext(LegendSizeContext);
  const mark = icon ?? <ChartSwatch color={color} shape={shape} size={size} />;
  return (
    <li
      data-slot="chart-legend-item"
      data-state={hidden ? "off" : "on"}
      className={cn("flex items-center gap-1.5", className)}
      {...props}
    >
      {onToggle ? (
        <Button
          variant="ghost"
          size="xs"
          aria-pressed={!hidden}
          aria-label={toggleLabel}
          onClick={onToggle}
          className={cn("gap-1.5 font-normal", hidden && "text-muted-foreground line-through")}
        >
          {mark}
          {children}
        </Button>
      ) : (
        <>
          {mark}
          {children}
        </>
      )}
    </li>
  );
}

/** The key to a chart's series. Text stays in ink; only the swatch carries the series color. */
export function ChartLegend({
  label = "Legend",
  size = "default",
  className,
  children,
  ...props
}: React.ComponentProps<"ul"> & {
  label?: string;
  size?: "sm" | "default";
}) {
  return (
    <LegendSizeContext.Provider value={size}>
      <ul
        data-slot="chart-legend"
        data-size={size}
        aria-label={label}
        className={cn(
          "flex flex-wrap items-center text-muted-foreground",
          size === "sm" ? "gap-x-3 gap-y-0.5 text-2xs" : "gap-x-4 gap-y-1 px-1 text-xs",
          className,
        )}
        {...props}
      >
        {children}
      </ul>
    </LegendSizeContext.Provider>
  );
}

/** The key to a continuous color scale: the low label, the ramp, the high label. */
export function ChartGradientLegend({
  stops,
  min,
  max,
  label = "Color scale",
  size = "default",
  className,
  ...props
}: Omit<React.ComponentProps<"div">, "children"> & {
  /** CSS colors from low to high. They come from the plot's own palette, which may be a canvas ramp. */
  stops: readonly string[];
  min: React.ReactNode;
  max: React.ReactNode;
  label?: string;
  size?: "sm" | "default";
}) {
  return (
    <div
      data-slot="chart-gradient-legend"
      className={cn("flex items-center gap-1.5 text-3xs text-muted-foreground tabular-nums", className)}
      {...props}
    >
      <span className="sr-only">{label}, from</span>
      <span>{min}</span>
      <span className="sr-only">to</span>
      <span
        aria-hidden="true"
        className={cn("rounded-full", size === "sm" ? "h-2 w-16" : "h-2.5 w-24")}
        style={{ background: `linear-gradient(to right, ${stops.join(", ")})` }}
      />
      <span>{max}</span>
    </div>
  );
}
