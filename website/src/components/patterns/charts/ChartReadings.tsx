/* eslint-disable jsx-a11y/no-noninteractive-tabindex -- The readings list is keyboard-scrollable when many series are selected. */
import { Children, createContext, type ReactNode, useContext } from "react";

import { ChartSwatch } from "~/components/patterns/charts/ChartLegend";
import { NoValue } from "~/components/ui/no-value";
import { FOCUS_RING, SCROLLBAR_THIN } from "~/components/ui/recipes";
import { TooltipCard } from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";

const ExtraColumnContext = createContext(false);
/** The card's size, so a `sm` card's rows drop their padding too. */
const ReadingsSizeContext = createContext<"sm" | "default">("default");

/** One series of a `ChartReadings`; children are its value. */
export function ChartReading({
  label,
  color,
  extra,
  highlighted = false,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<"li">, "color"> & {
  label: string;
  /** The series color, drawn as a dot before the label. */
  color?: string;
  /** A second, quieter value: the sample size behind the value. Needs `extraLabel` on the `ChartReadings`. */
  extra?: ReactNode;
  /** The series the reader singled out. List it first. */
  highlighted?: boolean;
}) {
  const hasExtraColumn = useContext(ExtraColumnContext);
  return (
    <li
      data-slot="chart-reading"
      data-highlighted={highlighted || undefined}
      className={cn(
        "flex items-center justify-between gap-3 rounded-sm px-1",
        useContext(ReadingsSizeContext) === "sm" ? "py-0" : "py-0.5",
        highlighted && "bg-accent",
        className,
      )}
      {...props}
    >
      <span className="me-auto flex min-w-0 items-center gap-1.5">
        {color && <ChartSwatch shape="dot" color={color} />}
        <span className="truncate" title={label}>
          {label}
        </span>
      </span>
      <span className="shrink-0 font-medium tabular-nums">{children}</span>
      {hasExtraColumn && (
        <span className="w-12 shrink-0 text-end text-muted-foreground tabular-nums">{extra ?? <NoValue />}</span>
      )}
    </li>
  );
}

interface ChartReadingsProps extends Omit<React.ComponentProps<typeof TooltipCard>, "title"> {
  /** What the readings are of: the bucket under the cursor. Leave it out only where the plot's own title says it. */
  title?: ReactNode;
  /** A count on the leading edge of the column headings: "12 heroes". */
  summary?: ReactNode;
  /** The heading of the value column. */
  valueLabel?: ReactNode;
  /** The heading of the `extra` column; passing it adds the column. */
  extraLabel?: ReactNode;
  scrollHint?: string;
  /** Names the scrollable list of readings: what they are and which bucket they belong to. */
  label?: string;
  /**
   * `lg` is a fixed, wider card for readings with a swatch and two value columns. `sm` is a tight card in the small
   * type step, for small multiples, where a tooltip must not cover the plots around its own.
   */
  size?: "sm" | "default" | "lg";
}

/**
 * The tooltip of a multi-series chart: one `ChartReading` per series. It can be hovered: moving into it does not
 * change the bucket underneath it, so a long list can be scrolled.
 */
export function ChartReadings({
  title,
  summary,
  valueLabel,
  extraLabel,
  scrollHint = "Scroll for all readings",
  label = "Chart readings",
  size = "default",
  className,
  children,
  ...props
}: ChartReadingsProps) {
  const count = Children.count(children);
  const hasExtraColumn = extraLabel != null;
  return (
    <TooltipCard
      data-slot="chart-readings"
      className={cn(
        size === "sm" ? "gap-1 px-2 py-1.5" : "gap-1.5 p-2.5",
        size === "lg" ? "w-64 max-w-full" : size === "sm" ? "max-w-56" : "max-w-72",
        className,
      )}
      onMouseMove={(event) => event.stopPropagation()}
      onPointerMove={(event) => event.stopPropagation()}
      {...props}
    >
      {title != null && <p className={cn("font-semibold", size === "sm" ? "text-2xs" : "text-xs")}>{title}</p>}
      {(summary || valueLabel || hasExtraColumn) && (
        <div className="flex justify-between gap-3 text-xs text-muted-foreground">
          <span>{summary}</span>
          <span className="ms-auto">{valueLabel}</span>
          {hasExtraColumn && <span className="w-12 text-end">{extraLabel}</span>}
        </div>
      )}
      <section
        key={typeof title === "string" ? title : undefined}
        aria-label={label}
        tabIndex={0}
        className={cn(
          FOCUS_RING,
          SCROLLBAR_THIN,
          "max-h-44 overflow-y-auto overscroll-contain rounded-sm focus-visible:ring-inset",
        )}
      >
        {children && (
          <ChartReadingList size={size === "sm" ? "sm" : "default"} extra={hasExtraColumn}>
            {children}
          </ChartReadingList>
        )}
      </section>
      {count > 7 && <p className="text-xs text-muted-foreground">{scrollHint}</p>}
    </TooltipCard>
  );
}

/**
 * `ChartReading` rows without the card: for readings shown in place of a plot (the back of a `ChartReveal`) rather
 * than floating over it. `extra` turns on the quieter second value column.
 */
export function ChartReadingList({
  size = "default",
  extra = false,
  className,
  ...props
}: React.ComponentProps<"ul"> & { size?: "sm" | "default"; extra?: boolean }) {
  return (
    <ExtraColumnContext.Provider value={extra}>
      <ReadingsSizeContext.Provider value={size}>
        <ul
          data-slot="chart-reading-list"
          className={cn("flex flex-col", size === "sm" ? "gap-0 text-2xs" : "gap-1 text-xs", className)}
          {...props}
        />
      </ReadingsSizeContext.Provider>
    </ExtraColumnContext.Provider>
  );
}
