import type { LucideIcon } from "lucide-react";

import { FilterRootContext } from "~/components/patterns/filter-bar/FilterCell";
import { cn } from "~/lib/utils";

interface FilterBarProps extends Omit<React.ComponentProps<"section">, "title"> {
  /**
   * - `cells`: the filters of a page, as the caption of what they filter: one quiet, start-aligned band of one-line
   *   FilterCells that wraps, directly above the table or chart. A `FilterBarEnd` holds the controls of the view.
   * - `toolbar`: a wrapping row of compact controls (Field, Segmented, Select size="sm"), for the controls of one
   *   chart or table.
   */
  variant?: "cells" | "toolbar";
  /** Names the bar. A toolbar draws it when it is wide enough; it is always available to assistive technology. */
  title?: string;
  icon?: LucideIcon;
}

export function FilterBar({
  variant = "cells",
  title,
  icon: Icon,
  "aria-label": ariaLabel,
  className,
  children,
  ...props
}: FilterBarProps) {
  if (variant === "toolbar") {
    return (
      <section
        data-slot="filter-bar"
        data-variant="toolbar"
        aria-label={ariaLabel ?? title ?? "Controls"}
        className={cn(
          "@container flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border bg-card px-3 py-2",
          className,
        )}
        {...props}
      >
        {title && (
          <div className="sr-only @lg:not-sr-only @lg:me-auto @lg:flex @lg:items-center @lg:gap-2">
            {Icon && <Icon className="size-4 text-primary" aria-hidden="true" />}
            <h2 className="text-sm font-semibold">{title}</h2>
          </div>
        )}
        {children}
      </section>
    );
  }
  return (
    <section
      data-slot="filter-bar"
      data-variant="cells"
      aria-label={ariaLabel ?? title ?? "Filters"}
      className={cn("@container flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2", className)}
      {...props}
    >
      <FilterRootContext.Provider value={true}>{children}</FilterRootContext.Provider>
    </section>
  );
}

/** The trailing end of a `FilterBar` of `cells`: the controls of the one view under it (a search, a switch, a metric). */
export function FilterBarEnd({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="filter-bar-end"
      className={cn("ms-auto flex flex-wrap items-center gap-x-4 gap-y-2 ps-2.5 pe-1", className)}
      {...props}
    />
  );
}
