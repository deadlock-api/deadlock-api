import type { LucideIcon } from "lucide-react";

import { FilterRootContext } from "~/components/patterns/filter-bar/FilterCell";
import { cn } from "~/lib/utils";

interface FilterBarProps extends Omit<React.ComponentProps<"section">, "title"> {
  /**
   * - `cells`: a grid of FilterCells divided by hairlines, for the filters of a page. Two across a narrow bar, three
   *   across a medium one, one row when there is room.
   * - `toolbar`: a wrapping row of compact controls (Field, Segmented, Select size="sm"), for the controls of one
   *   chart or table.
   */
  variant?: "cells" | "toolbar";
  /** `sticky` keeps a toolbar at the top of its scroll container while the long table under it scrolls. */
  position?: "static" | "sticky";
  /** Names the toolbar. Drawn when the toolbar is wide enough; always available to assistive technology. */
  title?: string;
  icon?: LucideIcon;
}

export function FilterBar({
  variant = "cells",
  position = "static",
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
        data-position={position}
        aria-label={ariaLabel ?? title ?? "Controls"}
        className={cn(
          "@container flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border bg-card px-3 py-2",
          position === "sticky" && "sticky top-2 z-20 bg-popover/90 shadow-md backdrop-blur-md",
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
      aria-label={ariaLabel}
      className={cn("@container w-full min-w-0", className)}
      {...props}
    >
      <div className="relative mx-auto w-full overflow-hidden rounded-xl border bg-card shadow-md @2xl:w-fit">
        {/* The hairlines between the cells are the 1px gaps, through which this background shows. */}
        <div className="flex flex-wrap items-stretch gap-px bg-border">
          <FilterRootContext.Provider value={true}>{children}</FilterRootContext.Provider>
        </div>
      </div>
    </section>
  );
}
