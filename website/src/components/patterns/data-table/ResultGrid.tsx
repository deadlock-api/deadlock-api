import { TableEmptyRow } from "~/components/patterns/data-table/TableEmptyRow";
import { Card } from "~/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { cn } from "~/lib/utils";

export interface ResultGridColumn {
  name: string;
  /** The column's data type, shown when its heading is hovered: "BIGINT". */
  type?: string;
}

function defaultFormat(value: unknown): string {
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    try {
      return JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v));
    } catch {
      return String(value);
    }
  }
  return String(value);
}

/**
 * Rows of unknown shape, as a query or a file returned them: monospace cells, numbers right-aligned, NULL set apart
 * from the empty string, long values truncated with the full text on hover.
 */
export function ResultGrid({
  columns,
  rows,
  density = "dense",
  formatCell = defaultFormat,
  nullLabel = "NULL",
  emptyLabel = "No rows",
  label,
  className,
  ...props
}: Omit<React.ComponentProps<typeof Card>, "children" | "tone" | "size" | "radius" | "interaction" | "asChild"> & {
  // ds-allow law10-config-array: the schema of a result set of unknown shape is data, not configuration
  columns: readonly ResultGridColumn[];
  rows: readonly (readonly unknown[])[];
  density?: "dense" | "compact";
  formatCell?: (value: unknown) => string;
  nullLabel?: string;
  emptyLabel?: React.ReactNode;
  /** Names the table for assistive technology: "Query result". */
  label?: string;
}) {
  return (
    <Card
      data-slot="result-grid"
      tone="inset"
      size="flush"
      radius="lg"
      className={cn("max-w-full", className)}
      {...props}
    >
      <Table
        density={density}
        aria-label={label}
        className={cn("w-auto min-w-full", density === "dense" && "text-2xs")}
      >
        <TableHeader>
          <TableRow>
            {columns.map((column, j) => (
              <TableHead
                key={column.name}
                title={column.type ? `${column.name}: ${column.type}` : column.name}
                className={cn(
                  "px-3 font-mono text-muted-foreground",
                  column.type && "cursor-help",
                  j > 0 && "border-s",
                )}
              >
                {column.name}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && <TableEmptyRow colSpan={Math.max(1, columns.length)}>{emptyLabel}</TableEmptyRow>}
          {rows.map((row, i) => (
            // oxlint-disable-next-line react/no-array-index-key -- a result set has no ids; its order is stable
            <TableRow key={i} className="odd:bg-subtle">
              {row.map((cell, j) => {
                const isNull = cell === null || cell === undefined;
                const text = isNull ? nullLabel : formatCell(cell);
                return (
                  <TableCell
                    // oxlint-disable-next-line react/no-array-index-key -- column order is stable
                    key={j}
                    title={isNull ? undefined : text}
                    className={cn(
                      "max-w-70 truncate px-3 font-mono",
                      j > 0 && "border-s",
                      isNull && "text-muted-foreground italic",
                      (typeof cell === "number" || typeof cell === "bigint") && "text-end tabular-nums",
                    )}
                  >
                    {text}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
