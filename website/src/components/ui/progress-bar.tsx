import { cva, type VariantProps } from "class-variance-authority";
import { Children, createContext, isValidElement, use, type ReactNode } from "react";

import { Delta } from "~/components/ui/delta";
import { NoValue } from "~/components/ui/no-value";
import { Tooltip } from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";
import type { Color } from "~/types/general";

const progressBarVariants = cva("", {
  variants: {
    variant: {
      /** The square comparative bar of analytics tables. */
      bar: "h-2.5 w-full bg-muted",
      /**
       * Drawn behind the value of a table cell, as scoreboards do. The cell is `relative` and its value sits in a
       * `relative` element so it stays above the fill.
       */
      cell: "pointer-events-none absolute inset-0 opacity-20",
    },
  },
  defaultVariants: { variant: "bar" },
});

/** The sum of the segments, which each segment is a share of. */
const ProgressBarTotalContext = createContext(0);

function segmentTotal(children: ReactNode) {
  let total = 0;
  Children.forEach(children, (child) => {
    if (isValidElement<{ value?: number }>(child)) total += child.props.value ?? 0;
  });
  return total;
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
    /** `ProgressBarSegment` elements, for a stacked bar. Their sum replaces `value`. */
    children?: ReactNode;
    /**
     * Names the bar and makes it a `progressbar` with its values. Without it the bar is decorative, which is right
     * whenever the number is printed beside it.
     */
    "aria-label"?: string;
  }) {
  const minVal = min || 0;
  const maxVal = max || 1;
  const total = segmentTotal(children);
  const clamped = Math.max(Math.min(total || value || 0, maxVal), minVal);
  const width = `${(((clamped - minVal) / (maxVal - minVal)) * 100).toFixed(2)}%`;
  const fill = "h-full transition-all duration-slow ease-standard";

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
          <ProgressBarTotalContext value={total}>{children}</ProgressBarTotalContext>
        </div>
      ) : (
        <div className={fill} style={{ backgroundColor: color || "var(--primary)", width }} />
      )}
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
  orientation = "vertical",
  tooltip,
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
  /** `vertical` puts the label under the bar; `horizontal` puts a short bar before it, for table cells. */
  orientation?: "vertical" | "horizontal";
  tooltip?: ReactNode;
  /** `ProgressBarSegment` elements, for a stacked bar. */
  children?: ReactNode;
}) {
  const horizontal = orientation === "horizontal";
  const reading = typeof value === "number" && Number.isFinite(value);
  const percentage = Math.round((((value || 0) - (min || 0)) / ((max || 1) - (min || 0))) * 100);
  const content = (
    <div
      data-slot="progress-bar-with-label"
      data-orientation={horizontal ? "horizontal" : "vertical"}
      className={cn(
        "flex w-full min-w-24 flex-col gap-2",
        horizontal && "flex-row items-center gap-2",
        tooltip && "cursor-default",
        className,
      )}
      {...props}
    >
      <div className={cn(horizontal && "w-10 shrink-0")} aria-hidden="true">
        <ProgressBar value={value} min={min} max={max} color={color}>
          {children}
        </ProgressBar>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className={cn("text-start text-sm text-muted-foreground", horizontal && "text-xs tabular-nums")}>
          {label || (reading ? `${percentage}%` : <NoValue />)}
        </span>
        {delta !== undefined && <Delta value={delta} format={deltaFormat} className="text-xs" />}
      </div>
    </div>
  );

  if (!tooltip) return content;

  return <Tooltip content={tooltip}>{content}</Tooltip>;
}
