import { cva, type VariantProps } from "class-variance-authority";
import { Children, createContext, isValidElement, use, useMemo, type ReactNode } from "react";

import { Delta } from "~/components/ui/delta";
import { NoValue } from "~/components/ui/no-value";
import { cn } from "~/lib/utils";
import type { Color } from "~/types/general";

const progressBarVariants = cva("", {
  variants: {
    variant: {
      /** The square comparative bar of analytics tables. */
      bar: "relative h-2.5 w-full bg-muted",
      /**
       * Drawn behind the value of a table cell, as scoreboards do. The cell is `relative` and its value sits in a
       * `relative` element so it stays above the fill.
       */
      cell: "pointer-events-none absolute inset-0 opacity-20",
      /** A thin rounded bar beside a visible rate label. Its fill defaults to positive. */
      thin: "relative h-1.5 min-w-0 rounded-full bg-muted",
    },
  },
  defaultVariants: { variant: "bar" },
});

/** The sum of the segments, which each segment is a share of. */
const ProgressBarTotalContext = createContext(0);

/** The bar's scale and its (clamped) value, which a marker is placed on and compared with. */
const ProgressBarScaleContext = createContext({ min: 0, max: 1, value: 0 });

function segmentTotal(children: ReactNode) {
  let total = 0;
  Children.forEach(children, (child) => {
    if (isValidElement<{ value?: number }>(child) && child.type === ProgressBarSegment) {
      total += child.props.value ?? 0;
    }
  });
  return total;
}

function partition(children: ReactNode) {
  const segments: ReactNode[] = [];
  const markers: ReactNode[] = [];
  Children.forEach(children, (child) => {
    if (isValidElement(child) && child.type === ProgressBarMarker) markers.push(child);
    else segments.push(child);
  });
  return { segments, markers };
}

/** One part of a stacked ProgressBar, as a direct child of it. `value` is on the bar's `min` to `max` scale. */
export function ProgressBarSegment({
  value,
  color,
  className,
  style,
  ...props
}: Omit<React.ComponentProps<"div">, "children" | "color"> & {
  value: number;
  /** A CSS color, usually one that comes from data: `var(--chart-2)`, a hero color. */
  color: string;
}) {
  const total = use(ProgressBarTotalContext);
  return (
    <div
      data-slot="progress-bar-segment"
      className={cn("h-full", className)}
      style={{ backgroundColor: color, width: total > 0 ? `${((value / total) * 100).toFixed(2)}%` : 0, ...style }}
      {...props}
    />
  );
}

/**
 * A second value on a ProgressBar, as a direct child of it: a tick at `value`, and the span between it and the bar's
 * value in `color`. Above the bar's value the span extends the fill; below it, the end of the fill is striped with the
 * track, so a gain and a loss against the bar's value read alike and differ by pattern as well as length. `value` is on the bar's `min` to `max` scale. Print both numbers
 * beside the bar: the marker is decorative.
 */
export function ProgressBarMarker({
  value,
  color,
  className,
  style,
  ...props
}: Omit<React.ComponentProps<"div">, "children" | "color"> & {
  value: number;
  /** A CSS color, usually one that comes from data: `var(--chart-5)`, a hero color. */
  color: string;
}) {
  const scale = use(ProgressBarScaleContext);
  const span = scale.max - scale.min;
  if (!Number.isFinite(value) || span <= 0) return null;
  const at = (v: number) => (Math.max(Math.min(v, scale.max), scale.min) - scale.min) / span;
  const markerAt = at(value);
  const barAt = at(scale.value);
  const pct = (fraction: number) => `${(fraction * 100).toFixed(2)}%`;
  return (
    <div
      data-slot="progress-bar-marker"
      aria-hidden="true"
      className={cn("contents", className)}
      style={style}
      {...props}
    >
      <div
        className={cn("absolute inset-y-0", markerAt >= barAt && "opacity-50")}
        style={{
          // Above the bar's value the span is a plain extension of the fill; below it, the fill it gives up is
          // striped in the marker color over the track, so a loss reads as such without relying on color alone.
          background:
            markerAt >= barAt
              ? color
              : `repeating-linear-gradient(-45deg, ${color} 0 0.125rem, var(--muted) 0.125rem 0.3125rem)`,
          insetInlineStart: pct(Math.min(markerAt, barAt)),
          width: pct(Math.abs(markerAt - barAt)),
        }}
      />
      <div
        className="absolute -inset-y-0.5 w-0.5 -translate-x-1/2 rtl:translate-x-1/2"
        style={{ backgroundColor: color, insetInlineStart: pct(markerAt) }}
      />
    </div>
  );
}

export function ProgressBar({
  value,
  min,
  max,
  color,
  variant = "bar",
  className,
  children,
  ...props
}: Omit<React.ComponentProps<"div">, "color"> &
  VariantProps<typeof progressBarVariants> & {
    value?: number;
    min?: number;
    max?: number;
    color?: Color;
    /**
     * `ProgressBarSegment` elements, for a stacked bar (their sum replaces `value`), and `ProgressBarMarker` elements,
     * for a second value to compare with.
     */
    children?: ReactNode;
    /**
     * Names the bar and makes it a `progressbar` with its values. Without it the bar is decorative, which is right
     * whenever the number is printed beside it.
     */
    "aria-label"?: string;
  }) {
  const minVal = min || 0;
  const maxVal = max || 1;
  const { segments, markers } = partition(children);
  const total = segmentTotal(segments);
  const clamped = Math.max(Math.min(total || value || 0, maxVal), minVal);
  // An empty range (one row, or every row equal) has no scale: the value is the maximum, so the bar is full rather
  // than a width of NaN% (which only happened to fill the track) or an empty bar that reads as the worst value.
  const span = maxVal - minVal;
  const width = `${(span > 0 ? ((clamped - minVal) / span) * 100 : 100).toFixed(2)}%`;
  const fill = cn("h-full transition-all duration-slow ease-standard", variant === "thin" && "rounded-full");
  const fallbackFill = variant === "thin" ? "bg-positive" : "bg-primary";
  const scale = useMemo(() => ({ min: minVal, max: maxVal, value: clamped }), [minVal, maxVal, clamped]);

  return (
    <div
      data-slot="progress-bar"
      data-variant={variant}
      className={cn(progressBarVariants({ variant }), className)}
      {...(props["aria-label"]
        ? { role: "progressbar", "aria-valuemin": minVal, "aria-valuemax": maxVal, "aria-valuenow": clamped }
        : { "aria-hidden": true })}
      {...props}
    >
      {total > 0 ? (
        <div className={cn("flex overflow-hidden", fill)} style={{ width }}>
          <ProgressBarTotalContext value={total}>{segments}</ProgressBarTotalContext>
        </div>
      ) : (
        <div className={cn(fill, !color && fallbackFill)} style={{ backgroundColor: color, width }} />
      )}
      {markers.length > 0 && <ProgressBarScaleContext value={scale}>{markers}</ProgressBarScaleContext>}
    </div>
  );
}

export function ProgressBarWithLabel({
  value,
  min,
  max,
  color,
  label,
  delta,
  deltaFormat = "percent",
  deltaDigits = 1,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<"div">, "color"> & {
  value?: number;
  min?: number;
  max?: number;
  color?: Color;
  label?: ReactNode;
  delta?: number;
  deltaFormat?: React.ComponentProps<typeof Delta>["format"];
  /** Decimals of the delta; a share far below 1% needs more than one to show its change. */
  deltaDigits?: number;
  /** `ProgressBarSegment` elements, for a stacked bar, and `ProgressBarMarker` elements, for a value to compare. */
  children?: ReactNode;
}) {
  const reading = typeof value === "number" && Number.isFinite(value);
  const span = (max || 1) - (min || 0);
  const percentage = span > 0 ? Math.round((((value || 0) - (min || 0)) / span) * 100) : 100;
  return (
    <div
      data-slot="progress-bar-with-label"
      className={cn("flex w-full min-w-24 flex-col gap-2", className)}
      {...props}
    >
      <div aria-hidden="true">
        <ProgressBar value={value} min={min} max={max} color={color}>
          {children}
        </ProgressBar>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-start text-sm text-muted-foreground">
          {label || (reading ? `${percentage}%` : <NoValue />)}
        </span>
        {delta !== undefined && <Delta value={delta} format={deltaFormat} digits={deltaDigits} className="text-xs" />}
      </div>
    </div>
  );
}
