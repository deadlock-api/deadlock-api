import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

import { cn } from "~/lib/utils";

export type SortDir = "asc" | "desc";

export const sortAlignClass = { start: "justify-start", center: "justify-center", end: "justify-end" };

/**
 * The only sortable column header. A native button inside the `<th>`, which carries `aria-sort`. Usable on its own
 * as `SortButton` where the header cell is not a TableHead.
 */
export function SortButton({
  active,
  sortDir,
  align = "center",
  size = "default",
  className,
  children,
  ...props
}: React.ComponentProps<"button"> & {
  active: boolean;
  sortDir: SortDir;
  align?: keyof typeof sortAlignClass;
  /** `sm` is for dense tables: smaller arrows, and no arrow at all on columns that are not sorted. */
  size?: "default" | "sm";
}) {
  const small = size === "sm";
  const iconClass = small ? "size-3" : "size-3.5";
  return (
    <button
      type="button"
      data-slot="sort-button"
      data-size={small ? "sm" : "default"}
      className={cn(
        "inline-flex min-h-6 items-center gap-1 rounded-sm transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50",
        sortAlignClass[align],
        className,
      )}
      {...props}
    >
      {children}
      {active ? (
        sortDir === "desc" ? (
          <ArrowDown aria-hidden="true" className={iconClass} />
        ) : (
          <ArrowUp aria-hidden="true" className={iconClass} />
        )
      ) : small ? null : (
        <ArrowUpDown aria-hidden="true" className="size-3.5 text-muted-foreground" />
      )}
    </button>
  );
}

export function ariaSort(active: boolean, sortDir: SortDir): "ascending" | "descending" | "none" {
  return active ? (sortDir === "desc" ? "descending" : "ascending") : "none";
}
