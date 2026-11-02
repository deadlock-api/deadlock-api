import { FilterRootContext } from "~/components/patterns/filter-bar/FilterCell";
import { cn } from "~/lib/utils";

/**
 * The one row of controls of a page: its filters as chips, then the open view's own controls (a metric, a search, a
 * switch), wrapping onto more rows on a narrow screen. A "Filters" label leads it and counts the chips that differ
 * from their defaults. A tab or panel never draws a second bar of its own: its controls join this row.
 */
export function FilterBar({ "aria-label": ariaLabel, className, children, ...props }: React.ComponentProps<"section">) {
  return (
    <section
      data-slot="filter-bar"
      aria-label={ariaLabel}
      className={cn("@container w-full min-w-0", className)}
      {...props}
    >
      <div className="relative flex flex-wrap items-center gap-2">
        <FilterRootContext.Provider value={true}>{children}</FilterRootContext.Provider>
        {/* Last in the document so its CSS counter has seen every chip; drawn first. It counts the chips that differ
            from their defaults (`filter-bar-count` in utilities.css) and shows the number only while one does. */}
        <span data-slot="filter-bar-count" aria-hidden="true" className="filter-bar-count order-first">
          Filters
        </span>
      </div>
    </section>
  );
}
