import { TableCell, TableRow } from "~/components/ui/table";
import { cn } from "~/lib/utils";

/** The body of a table whose query returned no rows. */
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
      <TableCell colSpan={colSpan} className="py-8 text-center text-sm text-muted-foreground">
        {children}
      </TableCell>
    </TableRow>
  );
}
