import { TableCell, TableRow } from "~/components/ui/table";
import { cn } from "~/lib/utils";

/** The body of a table whose query returned no rows. Its message wraps, so it never widens a narrow table. */
export function TableEmptyRow({
  colSpan,
  className,
  children = "No results found",
  ...props
}: React.ComponentProps<"tr"> & {
  colSpan: number;
}) {
  return (
    <TableRow data-table-empty-row className={cn("hover:bg-transparent", className)} {...props}>
      <TableCell
        colSpan={colSpan}
        className="py-8 text-center text-sm text-balance whitespace-normal text-muted-foreground"
      >
        {children}
      </TableCell>
    </TableRow>
  );
}
