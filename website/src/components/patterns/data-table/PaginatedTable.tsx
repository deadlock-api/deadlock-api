import { cn } from "~/lib/utils";

/**
 * A table with its `PaginationControls`. Long pages repeat the controls under the table, so the reader who reached
 * the last row does not scroll back up to turn the page.
 */
export function PaginatedTable({
  controls,
  position = "both",
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  /** A `PaginationControls`, or a feature's wrapper around it. */
  controls: React.ReactNode;
  position?: "top" | "bottom" | "both";
}) {
  return (
    <div data-slot="paginated-table" className={cn("flex min-w-0 flex-col", className)} {...props}>
      {position !== "bottom" && controls}
      {children}
      {position !== "top" && controls}
    </div>
  );
}
